// Safari does not fire `canplaythrough` preventing it from resolving naturally.
// A workaround is to not wait for the `canplaythrough` event but rather resolve early and hope for the best
const IS_MEDIA_PRELOAD_SUPPORTED = !getBrowserType.isSafari;

/**
 * Fetch wrapper for loading an item, to be processed by a specific loader afterwards
 *
 * @param item Item to fetch
 */
const fetchItem = (item: ILoadItem): Promise<Response> => fetch(item.src, item.options || {});

/**
 * Load an item and parse the Response as arrayBuffer
 *
 * @param item Item to load
 */
const loadArrayBuffer = (item: ILoadItem): Promise<ArrayBuffer | void> =>
  this.fetchItem(item)
    .then(response => response.arrayBuffer())
    .catch(err => {
      console.warn(err.message);
    });

/**
 * Load an item and parse the Response as <audio> element
 *
 * @param item Item to load
 */
const loadAudio = (item: ILoadItem): Promise<unknown> =>
  this.fetchItem(item)
    .then(response => response.blob())
    .then(
      blob =>
        new Promise((resolve, reject): void => {
          const audio = document.createElement('audio');
          audio.preload = 'auto';
          audio.autoplay = false;

          if (IS_MEDIA_PRELOAD_SUPPORTED) {
            audio.addEventListener('canplaythrough', function handler(): void {
              audio.removeEventListener('canplaythrough', handler);
              URL.revokeObjectURL(audio.src);
              resolve(audio);
            });

            audio.addEventListener('error', function handler(): void {
              audio.removeEventListener('error', handler);
              URL.revokeObjectURL(audio.src);
              reject(audio);
            });
          }

          audio.src = URL.createObjectURL(blob);

          if (!IS_MEDIA_PRELOAD_SUPPORTED) {
            // Force the audio to load but resolve immediately as `canplaythrough` event will never be fired
            audio.load();
            resolve(audio);
          }
        })
    )
    .catch(err => {
      console.error(err);
    });

const loadAudiopack = (item: ILoadItem): Promise<unknown> =>
  this.loadArrayBuffer(item).then((data: TVoidable<ArrayBuffer>): any => {
    if (data) {
      let content: TNullable<string> = null;
      let contentArray: TNullable<Uint8Array> = null;
      let binaryChunk: TNullable<ArrayBuffer> = null;
      let byteOffset: number = 0;
      let chunkIndex: number = 0;
      let chunkLength: number = 0;
      let chunkType: TNullable<number> = null;

      const headerMagic = new Uint8Array(data, 0, 4).reduce(
        (magic, char) => (magic += String.fromCharCode(char)),
        ''
      );

      assert(headerMagic === 'AUDP', 'AssetLoader -> Unsupported Audiopacker header');

      const chunkView = new DataView(data, 12);

      while (chunkIndex < chunkView.byteLength) {
        chunkLength = chunkView.getUint32(chunkIndex, true);
        chunkIndex += 4;

        chunkType = chunkView.getUint32(chunkIndex, true);
        chunkIndex += 4;

        if (chunkType === 0x4e4f534a) {
          contentArray = new Uint8Array(data, 12 + chunkIndex, chunkLength);
          content = contentArray.reduce((str, char) => (str += String.fromCharCode(char)), '');
        } else if (chunkType === 0x004e4942) {
          byteOffset = 12 + chunkIndex;
          binaryChunk = data.slice(byteOffset, byteOffset + chunkLength);
        }

        chunkIndex += chunkLength;
      }

      assert(content !== null, 'AssetLoader -> JSON content chunk not found');

      if (content) {
        const jsonChunk = JSON.parse(content);

        const binary = binaryChunk && binaryChunk.slice(jsonChunk.bufferStart, jsonChunk.bufferEnd);

        assert(binary !== null, 'AssetLoader -> Binary content chunk not found');

        const blob =
          binary &&
          new Blob([new Uint8Array(binary)], {
            type: jsonChunk.mimeType,
          });

        if (blob) {
          return Promise.resolve(
            this.loadAudio({ src: URL.createObjectURL(blob), id: item.src })
          ).then(audio => {
            return {
              audio,
              data: jsonChunk.data,
              mimeType: jsonChunk.mimeType,
            };
          });
        }
      }
    }
  });
