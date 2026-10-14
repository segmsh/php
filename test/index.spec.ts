import { assert, describe, it } from "vitest";
import eol from "eol";
import fs from "fs";
import path from "path";
import PhpProcessor from "../src";

const processor = new PhpProcessor();

const fixtures = fs
  .readdirSync(path.join("test", "fixtures"))
  .filter((filename) => filename.endsWith(".php"));

function readFixture(filename: string): string {
  return eol.lf(fs.readFileSync(path.join("test", "fixtures", filename), { encoding: "utf-8" }));
}

function textsByKey(input: string): Record<string, string> {
  return Object.fromEntries(
    processor.parse(input).segments.map(({ text, metadata }) => [String(metadata?.key), text]),
  );
}

describe("PhpProcessorTest", function () {
  fixtures.forEach((filename) => {
    it(`should roundtrip ${filename} exactly`, function () {
      const input = readFixture(filename);

      assert.equal(processor.stringify(processor.parse(input)), input);
    });

    it(`should process ${filename} correctly`, function () {
      const document = processor.parse(readFixture(filename));
      const roundTripped = processor.parse(processor.stringify(document));

      assert.equal(JSON.stringify(roundTripped), JSON.stringify(document));
    });

    it(`should keep ${filename} valid after translation`, function () {
      const document = processor.parse(readFixture(filename));
      const samples = [
        "Übersetzt 日本語 😀",
        "It's \"quoted\" with back\\slash and $5 or {$x}",
        "multi\nline\ttab\r\nend",
        "control \u0001 char and \\n literal",
        "ends with backslash\\",
      ];
      const expected = new Map<string, string>();

      document.segments.forEach((current, index) => {
        // Keep variable placeholders, they must survive translation
        const markers = current.text.match(/\{var\d+\}/g) ?? [];
        current.text = samples[index % samples.length] + markers.join(" ");
        expected.set(current.id, current.text);
      });

      // Re-parsing validates the PHP syntax and decodes the values again
      const output = processor.parse(processor.stringify(document));

      assert.equal(output.segments.length, document.segments.length);
      output.segments.forEach((current) => {
        assert.equal(current.text, expected.get(current.id));
      });
    });
  });

  it("should decode escapes like PHP", function () {
    assert.deepInclude(textsByKey(readFixture("edge.php")), {
      "MESS.single": "It's a back\\slash and a literal \\n here",
      "MESS.double": 'Tab\there, "quoted", dollar $5 and A😀',
      "MESS.multiline": "First line\nSecond line",
      "MESS.nested.key": "Nested key",
      "MESS.42": "Numeric key",
      APP_TITLE: "Application title",
      "lang.old": "Old style array",
      "lang.list..1": "two",
    });
  });

  it("should turn interpolated variables into placeholders", function () {
    const segment = processor.parse(readFixture("edge.php")).segments.find(({ metadata }) => metadata?.key === "MESS.vars")!;

    assert.equal(segment.text, "Hello {var0}, you have {var1} messages and {var2} total.");
    assert.deepEqual(segment.tags, {
      var0: { code: "$name" },
      var1: { code: "{$user->count}" },
      var2: { code: "${total}" },
    });
  });

  it("should skip values that are not plain strings", function () {
    const keys = Object.keys(textsByKey(readFixture("edge.php")));

    ["MESS.concat", "MESS.call", "MESS.number", "MESS.placeholder", "MESS.heredoc", "other", "APP_EMPTY"].forEach((key) =>
      assert.notInclude(keys, key),
    );
    assert.notInclude(Object.values(textsByKey(readFixture("edge.php"))), "Inline HTML after the closing tag is not a translation.");
  });

  it("should read Laravel language files", function () {
    assert.deepEqual(textsByKey(readFixture("laravel.php")), {
      failed: "These credentials do not match our records.",
      password: "The provided password is incorrect.",
      throttle: "Too many login attempts. Please try again in :seconds seconds.",
      "nested.title": "Welcome, :name!",
      "nested.items..0": "First item",
      "nested.items..1": "Second item",
    });
  });

  it("should keep the quote style and escape for it", function () {
    const document = processor.parse("<?php\n$a['s'] = 'Single';\n$a['d'] = \"Double $x\";\n");

    document.segments[0].text = "It's";
    document.segments[1].text = 'Say "hi" for $5 to {var0}';

    assert.equal(processor.stringify(document), "<?php\n$a['s'] = 'It\\'s';\n$a['d'] = \"Say \\\"hi\\\" for \\$5 to $x\";\n");
  });

  it("should give duplicate keys unique ids", function () {
    const ids = processor
      .parse(readFixture("edge.php"))
      .segments.filter(({ metadata }) => metadata?.key === "MESS.dup")
      .map(({ id }) => id);

    assert.lengthOf(ids, 2);
    assert.notEqual(ids[0], ids[1]);
  });

  it("should throw on invalid PHP", function () {
    assert.throws(() => processor.parse("<?php\n$MESS['a'] = ;\n"));
  });

  it("should produce deterministic ids", function () {
    const input = readFixture("edge.php");

    assert.deepEqual(processor.parse(input), processor.parse(input));
  });
});
