# @segmsh/php

PHP processor for [segm.sh](https://segm.sh). This package parses PHP localization files into a document (AST + segments) and stringifies them back, treating string values as translatable segments while leaving everything else byte-for-byte intact.

## Installation

```bash
npm install @segmsh/php
```

## Usage

```typescript
import PhpProcessor from "@segmsh/php";

const processor = new PhpProcessor();

const content = `<?php\n$MESS["WELCOME"] = "Hello $name, welcome back!";\n`;
const document = processor.parse(content);
// document.segments[0].text === "Hello {var0}, welcome back!"
// document.segments[0].tags === { var0: { code: "$name" } }
// document.segments[0].metadata === { key: "MESS.WELCOME" }

// ... modify document segments ...

const newContent = processor.stringify(document);
```

## Features

- **File Layouts**: Array assignments (`$MESS['KEY'] = '...';`, as in Bitrix or CodeIgniter), returned or assigned arrays (`return ['key' => '...'];`, `array(...)`, as in Laravel) and `define('KEY', '...')`.
- **Source Preservation**: Comments, formatting and all other code are kept exactly as written; only changed string literals are rewritten, in their original quote style.
- **Escapes**: Values are decoded like PHP does, so segments contain plain text; translated text is escaped back.
- **Variables**: Interpolated variables (`$name`, `{$user->name}`) become `{varN}` placeholders that keep their code in `tags`.
- **Key Paths**: Each segment carries its key path in `metadata.key` (e.g. `MESS.KEY`, `nested.items..0`).
- **Skipped Values**: Numbers, empty strings, `%s`-only formats, concatenations, function calls, heredoc and nowdoc strings.
- **Round-trip**: Parsing and stringifying an unchanged document returns the original input.

Parsing is done with [php-parser](https://github.com/glayzzle/php-parser).

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

[Apache-2.0](LICENSE)
