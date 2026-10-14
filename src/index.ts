import {
  Document,
  Element,
  Processor,
  Root,
  Segment,
  id,
  root,
  segment,
  text,
} from "@segmsh/core";
import { encode, parseLiteral, scan } from "./utils.js";

// Values without letters outside placeholders and printf formats ("%s", "%1$d") are not translatable
const isTranslatable = (value: string): boolean =>
  /\p{L}/u.test(
    value
      .replace(/\{\/?[A-Za-z_][\w:.-]*?\d+\}/g, "")
      .replace(/%(?:\d+\$)?[-+ 0#']*\d*(?:\.\d+)?[bcdeEfFgGosuxX]/g, ""),
  );

export default class PhpProcessor implements Processor {
  parse(res: string): Document {
    const children: Root["children"] = [];
    const segments: Segment[] = [];
    const occurrences = new Map<string, number>();
    let position = 0;

    scan(res).forEach((token) => {
      if (!isTranslatable(token.content.text)) return;

      if (token.start > position) {
        children.push(text(res.slice(position, token.start)));
      }

      // A key may be assigned more than once, ids must stay unique
      const occurrence = occurrences.get(token.key) ?? 0;
      occurrences.set(token.key, occurrence + 1);

      const segId = id(occurrence ? `${token.key}\u0000${occurrence}` : token.key);

      segments.push({
        id: segId,
        ...token.content,
        metadata: { key: token.key },
      });

      children.push({
        type: "element",
        tagName: "value",
        properties: { raw: token.raw },
        children: [segment(segId)],
      });

      position = token.end;
    });

    if (position < res.length) {
      children.push(text(res.slice(position)));
    }

    return { tree: root(children), segments };
  }

  stringify(document: Document): string {
    const segmentsMap = new Map<string, Segment>(
      document.segments.map((current) => [current.id, current]),
    );

    return document.tree.children
      .map((child) => {
        if (child.type === "text") return child.value;
        if (child.type !== "element") return "";

        const raw = String((child as Element).properties.raw);
        const ref = child.children[0];
        const current =
          ref?.type === "segment" ? segmentsMap.get(ref.id) : undefined;

        if (!current) return raw;

        // Unchanged values keep their original escapes and layout
        const original = parseLiteral(raw);

        if (
          original?.text === current.text &&
          JSON.stringify(original.tags) === JSON.stringify(current.tags)
        ) {
          return raw;
        }

        return encode(current, raw);
      })
      .join("");
  }
}
