import { deflate, inflate } from "pako";
import { encryptData, decryptData } from "./encryption";

// -----------------------------------------------------------------------------
// cadenas de bytes (binarias)
// -----------------------------------------------------------------------------
// implementación rápida, compatible con Buffer
export const toByteString = (
  data: string | Uint8Array | ArrayBuffer,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const blob =
      typeof data === "string"
        ? new Blob([new TextEncoder().encode(data)])
        : new Blob([data instanceof Uint8Array ? data : new Uint8Array(data)]);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target || typeof event.target.result !== "string") {
        return reject(new Error("couldn't convert to byte string"));
      }
      resolve(event.target.result);
    };
    reader.readAsBinaryString(blob);
  });
};

const byteStringToArrayBuffer = (byteString: string) => {
  const buffer = new ArrayBuffer(byteString.length);
  const bufferView = new Uint8Array(buffer);
  for (let i = 0, len = byteString.length; i < len; i++) {
    bufferView[i] = byteString.charCodeAt(i);
  }
  return buffer;
};

const byteStringToString = (byteString: string) => {
  return new TextDecoder("utf-8").decode(byteStringToArrayBuffer(byteString));
};

// -----------------------------------------------------------------------------
// base64
// -----------------------------------------------------------------------------

/**
 * @param isByteString set to true if already byte string to prevent bloat
 *  due to reencoding
 */
export const stringToBase64 = async (str: string, isByteString = false) => {
  return isByteString ? window.btoa(str) : window.btoa(await toByteString(str));
};

// asíncrono para alinear con stringToBase64
export const base64ToString = async (base64: string, isByteString = false) => {
  return isByteString
    ? window.atob(base64)
    : byteStringToString(window.atob(base64));
};

// -----------------------------------------------------------------------------
// codificación de texto
// -----------------------------------------------------------------------------

type EncodedData = {
  encoded: string;
  encoding: "bstring";
  /** si el texto está comprimido (zlib) */
  compressed: boolean;
  /** versión para posibles propósitos de migración */
  version?: string;
};

/**
 * Encodes (and potentially compresses via zlib) text to byte string
 */
export const encode = async ({
  text,
  compress,
}: {
  text: string;
  /** por defecto es `true`. Si la compresión falla, usa solo bstring. */
  compress?: boolean;
}): Promise<EncodedData> => {
  let deflated!: string;
  if (compress !== false) {
    try {
      deflated = await toByteString(deflate(text));
    } catch (error: any) {
      console.error("encode: cannot deflate", error);
    }
  }
  return {
    version: "1",
    encoding: "bstring",
    compressed: !!deflated,
    encoded: deflated || (await toByteString(text)),
  };
};

export const decode = async (data: EncodedData): Promise<string> => {
  let decoded: string;

  switch (data.encoding) {
    case "bstring":
      // si está comprimido, no decodificar dos veces el bstring
      decoded = data.compressed
        ? data.encoded
        : await byteStringToString(data.encoded);
      break;
    default:
      throw new Error(`decode: unknown encoding "${data.encoding}"`);
  }

  if (data.compressed) {
    return inflate(new Uint8Array(byteStringToArrayBuffer(decoded)), {
      to: "string",
    });
  }

  return decoded;
};

// -----------------------------------------------------------------------------
// codificación binaria
// -----------------------------------------------------------------------------

type FileEncodingInfo = {
  /* la versión 2 es la versión con la que lanzamos el soporte inicial de imágenes.
    la versión 1 fue una versión de PR que mucha gente estaba usando de todos modos.
    Por lo tanto, si hay problemas, podemos verificar si no están usando la
    versión oficial no oficial */
  version: 1 | 2;
  compression: "pako@1" | null;
  encryption: "AES-GCM" | null;
};

// -----------------------------------------------------------------------------
const CONCAT_BUFFERS_VERSION = 1;
/** cuántos bytes usamos para codificar cuántos bytes tiene el siguiente bloque.
 * Corresponds to DataView setter methods (setUint32, setUint16, etc).
 *
 * NOTE ! values must not be changed, which would be backwards incompatible !
 */
const VERSION_DATAVIEW_BYTES = 4;
const NEXT_CHUNK_SIZE_DATAVIEW_BYTES = 4;
// -----------------------------------------------------------------------------

const DATA_VIEW_BITS_MAP = { 1: 8, 2: 16, 4: 32 } as const;

// getter
function dataView(buffer: Uint8Array, bytes: 1 | 2 | 4, offset: number): number;
// setter
function dataView(
  buffer: Uint8Array,
  bytes: 1 | 2 | 4,
  offset: number,
  value: number,
): Uint8Array;
/**
 * abstraction over DataView that serves as a typed getter/setter in case
 * you're using constants for the byte size and want to ensure there's no
 * discrepenancy in the encoding across refactors.
 *
 * DataView serves for an endian-agnostic handling of numbers in ArrayBuffers.
 */
function dataView(
  buffer: Uint8Array,
  bytes: 1 | 2 | 4,
  offset: number,
  value?: number,
): Uint8Array | number {
  if (value != null) {
    if (value > Math.pow(2, DATA_VIEW_BITS_MAP[bytes]) - 1) {
      throw new Error(
        `attempting to set value higher than the allocated bytes (value: ${value}, bytes: ${bytes})`,
      );
    }
    const method = `setUint${DATA_VIEW_BITS_MAP[bytes]}` as const;
    new DataView(buffer.buffer)[method](offset, value);
    return buffer;
  }
  const method = `getUint${DATA_VIEW_BITS_MAP[bytes]}` as const;
  return new DataView(buffer.buffer)[method](offset);
}

// -----------------------------------------------------------------------------

/**
 * Resulting concatenated buffer has this format:
 *
 * [
 *   VERSION chunk (4 bytes)
 *   LENGTH chunk 1 (4 bytes)
 *   DATA chunk 1 (up to 2^32 bits)
 *   LENGTH chunk 2 (4 bytes)
 *   DATA chunk 2 (up to 2^32 bits)
 *   ...
 * ]
 *
 * @param buffers each buffer (chunk) must be at most 2^32 bits large (~4GB)
 */
const concatBuffers = (...buffers: Uint8Array[]) => {
  const bufferView = new Uint8Array(
    VERSION_DATAVIEW_BYTES +
      NEXT_CHUNK_SIZE_DATAVIEW_BYTES * buffers.length +
      buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0),
  );

  let cursor = 0;

  // como primer bloque codificaremos la versión para compatibilidad hacia atrás
  dataView(bufferView, VERSION_DATAVIEW_BYTES, cursor, CONCAT_BUFFERS_VERSION);
  cursor += VERSION_DATAVIEW_BYTES;

  for (const buffer of buffers) {
    dataView(
      bufferView,
      NEXT_CHUNK_SIZE_DATAVIEW_BYTES,
      cursor,
      buffer.byteLength,
    );
    cursor += NEXT_CHUNK_SIZE_DATAVIEW_BYTES;

    bufferView.set(buffer, cursor);
    cursor += buffer.byteLength;
  }

  return bufferView;
};

/** solo se puede usar en buffers creados vía `concatBuffers()` */
const splitBuffers = (concatenatedBuffer: Uint8Array) => {
  const buffers = [];

  let cursor = 0;

  // el primer bloque es la versión
  const version = dataView(
    concatenatedBuffer,
    NEXT_CHUNK_SIZE_DATAVIEW_BYTES,
    cursor,
  );
  // Si la versión está fuera de las soportadas, lanza un error.
  // Esto usualmente significa que el buffer no fue codificado usando esta API, así que solo
  // desperdiciaríamos cómputo.
  if (version > CONCAT_BUFFERS_VERSION) {
    throw new Error(`invalid version ${version}`);
  }

  cursor += VERSION_DATAVIEW_BYTES;

  while (true) {
    const chunkSize = dataView(
      concatenatedBuffer,
      NEXT_CHUNK_SIZE_DATAVIEW_BYTES,
      cursor,
    );
    cursor += NEXT_CHUNK_SIZE_DATAVIEW_BYTES;

    buffers.push(concatenatedBuffer.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
    if (cursor >= concatenatedBuffer.byteLength) {
      break;
    }
  }

  return buffers;
};

// ayudantes para (des)comprimir datos con metadatos JSON incluyendo cifrado
// -----------------------------------------------------------------------------

/** @private */
const _encryptAndCompress = async (
  data: Uint8Array | string,
  encryptionKey: string,
) => {
  const { encryptedBuffer, iv } = await encryptData(
    encryptionKey,
    deflate(data),
  );

  return { iv, buffer: new Uint8Array(encryptedBuffer) };
};

/**
 * The returned buffer has following format:
 * `[]` refers to a buffers wrapper (see `concatBuffers`)
 *
 * [
 *   encodingMetadataBuffer,
 *   iv,
 *   [
 *      contentsMetadataBuffer
 *      contentsBuffer
 *   ]
 * ]
 */
export const compressData = async <T extends Record<string, any> = never>(
  dataBuffer: Uint8Array,
  options: {
    encryptionKey: string;
  } & ([T] extends [never]
    ? {
        metadata?: T;
      }
    : {
        metadata: T;
      }),
): Promise<Uint8Array> => {
  const fileInfo: FileEncodingInfo = {
    version: 2,
    compression: "pako@1",
    encryption: "AES-GCM",
  };

  const encodingMetadataBuffer = new TextEncoder().encode(
    JSON.stringify(fileInfo),
  );

  const contentsMetadataBuffer = new TextEncoder().encode(
    JSON.stringify(options.metadata || null),
  );

  const { iv, buffer } = await _encryptAndCompress(
    concatBuffers(contentsMetadataBuffer, dataBuffer),
    options.encryptionKey,
  );

  return concatBuffers(encodingMetadataBuffer, iv, buffer);
};

/** @private */
const _decryptAndDecompress = async (
  iv: Uint8Array,
  decryptedBuffer: Uint8Array,
  decryptionKey: string,
  isCompressed: boolean,
) => {
  decryptedBuffer = new Uint8Array(
    await decryptData(iv, decryptedBuffer, decryptionKey),
  );

  if (isCompressed) {
    return inflate(decryptedBuffer);
  }

  return decryptedBuffer;
};

export const decompressData = async <T extends Record<string, any>>(
  bufferView: Uint8Array,
  options: { decryptionKey: string },
) => {
  // el primer bloque es metadatos de codificación (ignorado por ahora)
  const [encodingMetadataBuffer, iv, buffer] = splitBuffers(bufferView);

  const encodingMetadata: FileEncodingInfo = JSON.parse(
    new TextDecoder().decode(encodingMetadataBuffer),
  );

  try {
    const [contentsMetadataBuffer, contentsBuffer] = splitBuffers(
      await _decryptAndDecompress(
        iv,
        buffer,
        options.decryptionKey,
        !!encodingMetadata.compression,
      ),
    );

    const metadata = JSON.parse(
      new TextDecoder().decode(contentsMetadataBuffer),
    ) as T;

    return {
      /** la fuente de metadatos siempre es JSON así que podemos decodificarlo aquí */
      metadata,
      /** los datos pueden ser cualquier cosa así que quien llama debe decodificarlo */
      data: contentsBuffer,
    };
  } catch (error: any) {
    console.error(
      `Error durante la descomprimiendo y descifrando el archivo.`,
      encodingMetadata,
    );
    throw error;
  }
};

// -----------------------------------------------------------------------------
