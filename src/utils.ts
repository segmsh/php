import type { Tag } from "@segmsh/core";
import { Engine } from "php-parser";

export interface Content {
  text: string;
  tags?: Record<string, Tag>;
}

export interface StringToken {
  start: number;
  end: number;
  raw: string;
  key: string;
  content: Content;
}

// Minimal shape of php-parser nodes used here
interface PhpNode {
  kind: string;
  loc?: { start: { offset: number }; end: { offset: number } };
  [key: string]: any;
}

const engine = new Engine({
  parser: { php8: true, suppressErrors: false, extractDoc: false },
  ast: { withPositions: true },
});

const MARKER_REGEXP: RegExp = /(\{\/?[A-Za-z_][\w:.-]*?\d+\})/;

const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  $: "\\$",
  "\t": "\\t",
  "\r": "\\r",
  "\v": "\\v",
  "\f": "\\f",
  "\x1b": "\\e",
};

const span = (node: PhpNode): [number, number] => [node.loc!.start.offset, node.loc!.end.offset];

// Text of a string literal; interpolated variables become {varN} markers
const toContent = (node: PhpNode, source: string): Content | null => {
  if (node.kind === "string") return { text: node.value };

  if (node.kind !== "encapsed" || node.type !== "string") return null;

  const tags: Record<string, Tag> = {};
  let index = 0;

  const text = (node.value as PhpNode[])
    .map((part) => {
      if (part.expression.kind === "string") return part.expression.value as string;

      const key = `var${index++}`;
      const [start, end] = span(part);
      tags[key] = { code: source.slice(start, end) };

      return `{${key}}`;
    })
    .join("");

  return Object.keys(tags).length ? { text, tags } : { text };
};

const keyOf = (node: PhpNode | null): string | null => {
  if (node?.kind === "string" || node?.kind === "number") return String(node.value);
  return null;
};

// "$MESS['a']['b']" -> ["MESS", "a", "b"]
const targetPath = (node: PhpNode): string[] | null => {
  if (node.kind === "variable" && typeof node.name === "string") return [node.name];

  if (node.kind === "offsetlookup") {
    const parent = targetPath(node.what);
    const key = keyOf(node.offset);

    return parent && key !== null ? [...parent, key] : null;
  }

  return null;
};

export const scan = (source: string): StringToken[] => {
  const tokens: StringToken[] = [];

  const visitValue = (node: PhpNode | null, path: string[]) => {
    if (!node) return;

    if (node.kind === "array") {
      let index = 0;

      (node.items as PhpNode[]).forEach((entry) => {
        if (!entry || entry.kind !== "entry") return;

        const key = keyOf(entry.key);
        visitValue(entry.value, key === null ? [...path, "", String(index++)] : [...path, key]);
      });

      return;
    }

    const content = toContent(node, source);
    if (!content) return;

    const [start, end] = span(node);
    tokens.push({ start, end, raw: source.slice(start, end), key: path.join("."), content });
  };

  const visitStatement = (node: PhpNode) => {
    if (node.kind === "namespace" || node.kind === "block" || node.kind === "program") {
      (node.children as PhpNode[]).forEach(visitStatement);
    } else if (node.kind === "return") {
      visitValue(node.expr, []);
    } else if (node.kind === "expressionstatement") {
      const expression = node.expression as PhpNode;

      if (expression.kind === "assign" && expression.operator === "=") {
        const path = targetPath(expression.left);
        if (path) visitValue(expression.right, path);
      } else if (
        expression.kind === "call" &&
        expression.what?.kind === "name" &&
        String(expression.what.name).toLowerCase() === "define"
      ) {
        const name = keyOf(expression.arguments[0]);
        if (name !== null) visitValue(expression.arguments[1], [name]);
      }
    }
  };

  visitStatement(engine.parseCode(source, "input.php") as unknown as PhpNode);

  return tokens.sort((a, b) => a.start - b.start);
};

// Re-reads a string literal on its own
export const parseLiteral = (raw: string): Content | null => {
  const program = engine.parseCode(`<?php\n${raw};`, "literal.php") as unknown as PhpNode;
  const statement = program.children[0] as PhpNode;
  const prefix = "<?php\n".length;

  return statement?.kind === "expressionstatement"
    ? toContent(statement.expression, " ".repeat(prefix) + raw)
    : null;
};

const encodeSingle = (text: string): string => `'${text.replace(/[\\']/g, "\\$&")}'`;

const encodeDouble = (content: Content, literalNewlines: boolean): string => {
  const encoded = content.text
    .split(MARKER_REGEXP)
    .map((part) => {
      const marker = /^\{(\w+)\}$/.exec(part);
      if (marker) return content.tags?.[marker[1]]?.code ?? "";

      return part.replace(/[\x00-\x1f\x7f\\"$]/g, (char) => {
        if (char === "\n") return literalNewlines ? "\n" : "\\n";
        return ESCAPES[char] ?? `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
      });
    })
    .join("");

  return `"${encoded}"`;
};

// Keeps the original quote style; variables only exist in double quotes
export const encode = (content: Content, raw: string): string => {
  const prefix = /^[bB]/.test(raw) ? raw[0] : "";
  const quote = raw[prefix.length];
  const hasVariables = Object.keys(content.tags ?? {}).length > 0;

  if (quote === "'" && !hasVariables) return prefix + encodeSingle(content.text);

  return prefix + encodeDouble(content, raw.includes("\n"));
};
