// Native
import { readFileSync, writeFile, unlinkSync, statSync } from 'fs';
import { resolve as resolvePath } from 'path';

// Vendor
import audiosprite from 'audiosprite';
import glob from 'glob';
import mimeTypes from 'mime-types';

// Arguments
import { ICLIArgs } from './argsHandler';

// Constants
import { SUPPORTED_INPUT_TYPES } from './constants';

// Utilities
import { getFileExtension, getFileName, getFilePath, isDirectory } from './utilities';

/**
 * Get a recursive listing of files either by a manifest.json file or input directory
 *
 * @param inputPath Input path
 */
const getFileList = (inputPath: string): Promise<string[]> => {
  if (isDirectory(inputPath)) {
    return new Promise((resolve, reject): any => {
      glob(`${inputPath}/**/*`, (error: Error | null, globList: string[]): void => {
        if (error) {
          reject(error);
        }

        resolve(globList.filter((file: string): boolean => !isDirectory(resolvePath(file))));
      });
    });
  }

  if (getFileName(inputPath) === 'manifest' && getFileExtension(inputPath) === '.json') {
    return new Promise((resolve, reject): any => {
      const manifestContent = JSON.parse(readFileSync(inputPath, 'utf8'));
      const manifestFiles = manifestContent.manifest.map(
        (manifestEntry: { src: string }): string => `${manifestContent.path}${manifestEntry.src}`
      );

      if (manifestFiles.length < 1) {
        reject(new Error('Manifest should contain one or more entries'));

        if (!manifestFiles) {
          reject(
            new Error(
              `Unable to read manifest in ${getFilePath(inputPath)}${getFileName(
                inputPath
              )}${getFileExtension(inputPath)}`
            )
          );
        }
      }

      resolve(manifestFiles);
    });
  }

  throw new Error('Input must either be a directory or a JSON configuration');
};

/**
 * Pack a files into a single audiopack format
 */
export const pack = (CLIArgs?: ICLIArgs): Promise<any> => {
  let args: ICLIArgs;

  if (!CLIArgs) {
    args = require('./argsHandler').CLIArgs;
  } else {
    args = CLIArgs;
  }

  return new Promise((resolve, reject): void => {
    getFileList(args.input).then(fileList => {
      if (args.verbose) {
        console.log('Processing the following files:\n');
        fileList.forEach(file => console.log(`- ${file}`));
      }

      const supportedList = fileList.filter(file => {
        if (SUPPORTED_INPUT_TYPES.includes(getFileExtension(file))) {
          return file;
        } else {
          console.warn(`\n${file} is not supported and will not be included.`);
          console.warn(`The supported file extensions are: [${SUPPORTED_INPUT_TYPES}]`);
        }
      });

      audiosprite(
        supportedList,
        {
          output: `${getFilePath(args.output)}${getFileName(args.output)}`,
          format: 'createjs',
          export: getFileExtension(args.output).substring(1),
        },
        (err: any, obj: any) => {
          if (err) {
            console.error(err);
            reject(err);
          }

          const buffers: Buffer[] = [];

          const mimeType = mimeTypes.lookup(getFileExtension(args.output)) || '';
          const fileSize = statSync(args.output).size;
          const fileContent = readFileSync(args.output);

          buffers.push(fileContent);

          // Pad the JSON data to 4-byte chunks
          let jsonData = JSON.stringify({
            mimeType,
            bufferStart: 0,
            bufferEnd: fileSize,
            data: obj.data.audioSprite,
          });
          const remainder = Buffer.byteLength(jsonData) % 4;
          jsonData = jsonData.padEnd(jsonData.length + (remainder === 0 ? 0 : 4 - remainder), ' ');

          if (args.verbose) {
            console.log(`\n${jsonData}`);
          }

          // Create the JSON and BIN buffer
          const jsonBuffer = Buffer.from(jsonData);
          const binaryBuffer = Buffer.concat(buffers);

          // Allocate buffer (Global header) + (JSON chunk header) + (JSON chunk) + (Binary chunk header) + (Binary chunk)
          const audiopackBufferLength = 12 + 8 + jsonBuffer.length + 8 + binaryBuffer.length;
          const audiopack = Buffer.alloc(audiopackBufferLength);

          // Keep track of the internal byte offset
          let byteOffset = 0;

          // Write AUDIOPACK magic
          audiopack.writeUInt32LE(0x50445541, 0); // AUDP
          byteOffset += 4;

          // Write AUDIOPACK version
          audiopack.writeUInt32LE(1, byteOffset);
          byteOffset += 4;

          // Write AUDIOPACK length
          audiopack.writeUInt32LE(audiopackBufferLength, byteOffset);
          byteOffset += 4;

          // Write JSON buffer length
          audiopack.writeUInt32LE(jsonBuffer.length, byteOffset);
          byteOffset += 4;

          // Write JSON chunk magic
          audiopack.writeUInt32LE(0x4e4f534a, byteOffset); // JSON
          byteOffset += 4;

          // Write JSON chunk
          jsonBuffer.copy(audiopack, byteOffset);
          byteOffset += jsonBuffer.length;

          // Write BIN chunk length
          audiopack.writeUInt32LE(binaryBuffer.length, byteOffset);
          byteOffset += 4;

          // Write BIN chunk magic
          audiopack.writeUInt32LE(0x004e4942, byteOffset); // BIN
          byteOffset += 4;

          // Write BIN chunk
          binaryBuffer.copy(audiopack, byteOffset);

          // Remove the original file
          unlinkSync(args.output);

          // Write the file to disk
          writeFile(
            `${getFilePath(args.output)}${getFileName(args.output)}.audiopack`,
            audiopack,
            () => {
              if (args.verbose) {
                console.log(
                  `\nWrote to ${getFilePath(args.output)}${getFileName(args.output)}.audiopack`
                );
              }

              resolve();
            }
          );
        }
      );
    });
  });
};
