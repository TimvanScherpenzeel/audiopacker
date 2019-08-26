// Native
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';

// Vendor
import glob from 'glob';

// Arguments
import { ICLIArgs } from './argsHandler';

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

      exec(
        `ffmpeg -i ${(() =>
          fileList.reduce(
            (files, file) => files + ` -i ${file.replace(/ /g, '\\ ')}`
          ))()} -filter_complex "aevalsrc=exprs=0:d=1[silence], [0:a] [silence] [1:a] concat=n=${fileList.length +
          1}:v=0:a=1" -y ${args.output}`,
        (error, stdout, stderr) => {
          console.log(stderr);

          if (error) {
            console.log(stderr);
            reject(error);
          }

          if (args.verbose) {
            console.log(stdout);
          }

          resolve();
        }
      );
    });
  });
};
