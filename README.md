[![GitHub](https://img.shields.io/github/release/steven-r/writer-name-handler.svg?style=flat-square)](https://github.com/steven-r/writer-name-handler/releases)
[![The MIT License](https://img.shields.io/badge/license-MIT-orange.svg?style=flat-square)](http://opensource.org/licenses/MIT)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/sreindl.writer-name-handler.svg?style=flat-square)

# markdown name handler for Visual Studio Code

This plugin handles names to be used in markdown files. The syntax is similar to the pandoc-gls plugin.

To enable this plugin, create one or more files named `names.yml` or `names.yaml`.

Names are wrapped in parents and marked with an exclamation mark, e.g. (-Mike) will be the name "Mike".

An example would be

    # Some text

    Once upon a time, there was a thief, (-Mike) Hauser, and his wife, (-Maren).
    (-He@Mike) is also very well known as (-Tunder).

Given the following configuration file:

```yaml
Mike Folder:
  aka:
    - Mike
    - Thunder
  description: |
    Mike is a 54 year old thief. [...]
    During his time at the ary he has been called 'Thunder'.

Maren Folder:
  aka: Maren
  description: Mike's wife.
```

Every time you encounter `(-Mike Folder)`, `(-Mike)`, `(-Thunder)`, or `(-he@mike)` in your texts, a little hover will tell you more about the term.
In case the term is not defined, the entry is marked as an error.

Configuration files are being read while opening a workspace and are refreshed while changing these files.

## Configuration files

You can use the configuration files to create glossary files or abbrovation files for other output languages.

## Functionality of the Language Server

This Language Server works for any files. It has the following language features:

- Diagnostics regenerated on each change of `names.yml` in any workspace folder.

It also includes an End-to-End test.

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Publishing

Just run:

```bash
npx vsce package
```
