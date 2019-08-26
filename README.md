# Audiopacker

[![npm version](https://badge.fury.io/js/%40timvanscherpenzeel%2Faudiopacker.svg)](https://www.npmjs.com/package/@timvanscherpenzeel/audiopacker)

CLI tool for packing multiple audio sprites into a single audio file.

Inspired by [GLB File Format Specification](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#glb-file-format-specification) and [audiosprite](https://github.com/tonistiigi/audiosprite).

## Installation

Make sure you have [Node.js](http://nodejs.org/) installed.

```sh
$ npm install -g --save @timvanscherpenzeel/audiopacker
```

## CLI Usage

```sh
$ node ./bin/audiopacker.js -i ./input -o ./output/example.audiopack -vb
```

```sh
$ node ./bin/audiopacker.js -i ./input/manifest.json -o ./output/example.audiopack -vb
```

## Manifest structure

```
{
  "path": "./input/",
  "manifest": [
    {
      "src": "010-0-start.mp3"
    },
    {
      "src": "010-1-loop.mp3"
    }
  ]
}
```

## File structure

A `.audiopack` file has the following structure (very similar to the [GLB File Format Specification](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#glb-file-format-specification)):

![file_structure](/docs/file_structure.png?raw=true)

_Figure from the [GLB File Format Specification](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0)._

### Endianness

`Audiopack` is little endian.

### 12-byte header

The 12-byte header consists of three 4-byte entries:

```
uint32 magic
uint32 version
uint32 length
```

- `magic` equals `0x504e4942`. It is ASCII string `AUDP`, and can be used to identify data as `Audiopack`.

- `version` indicates the version of the `Audiopack`. This specification defines version 1.

- `length` is the total length of the `Audiopack` file, including Header and all Chunks, in bytes.

### JSON chunk header

_A single JSON chunk header_

The JSON chunk header has a field that marks the length of the JSON chunk (`uint32 chunkLength`) and a type (`uint32 chunkType`) marked `JSON` in ASCII.

### JSON chunk

_A single JSON chunk_

The JSON chunk (`ubyte[] chunkData`) contains a stringified JSON description of the processed files: `name`, `bufferStart`, `bufferEnd` and `mimeType`. The difference between `bufferStart` and `bufferEnd` describe the length of the file. This length is used to extract the correct amount of bytes per file from the binary chunk that follows next.

### Binary chunk header

_A single binary chunk header_

The binary chunk header has a field that marks the length of the binary chunk (`uint32 chunkLength`) and a type (`uint32 chunkType`) marked `BIN` in ASCII.

### Binary chunk

_A single binary chunk_

The binary chunk (`ubyte[] chunkData`) contains a single `Uint8Array` typed array buffer that has been constructed out of concatenated files. Using the data described in the JSON chunk one can correctly extract the file from the binary chunk.

## Flags

### Required

    -i, --input [example: ./input (glob) or ./input/manifest.json (manifest)] [required]
    -o, --output [example: ./output/example.audiopack] [required]

### Optional

    -vb, --verbose [true / false, default: false] [not required]

## License

My work is released under the [MIT license](https://raw.githubusercontent.com/TimvanScherpenzeel/audiopacker/master/LICENSE).
