import { useCallback, useMemo } from 'react';
import { GLBToSTLConverter } from '~/utils/glb-to-stl-converter';

export interface STLConversionOptions {
  /** Whether to use binary STL format (smaller files) */
  binary?: boolean;
  /** Scale factor to apply to the model */
  scale?: number;
  /** Whether to merge all geometries into a single mesh */
  mergeGeometries?: boolean;
  binaryHeader?: string;
}

export function useSTLConverter() {
  const converter = useMemo(() => new GLBToSTLConverter(), []);

  const convertBlobToSTL = useCallback(async (
    glbBlob: Blob,
    filename: string,
    options: STLConversionOptions = {}
  ) => {
    try {
      // Convert blob to File object for the converter
      const file = new File([glbBlob], `${filename}.glb`, { type: 'model/gltf-binary' });
      
      const stlData = await converter.convertGLBToSTL(file, {
        binary: options.binary ?? true,
        scale: options.scale ?? 1,
        mergeGeometries: options.mergeGeometries ?? true
      });
      if (options.binaryHeader && stlData instanceof DataView) {
        const header = new Uint8Array(stlData.buffer, stlData.byteOffset, 80);
        header.set(new TextEncoder().encode(options.binaryHeader).subarray(0, header.length));
      }
      
      // Download the STL file
      return converter.downloadSTL(stlData, `${filename}.stl`);

    } catch (error) {
      console.error('STL conversion failed:', error);
      throw error;
    }
  }, [converter]);

  const convertAndDownload = useCallback(async (
    glbBlob: Blob,
    filename: string,
    options: STLConversionOptions = {}
  ) => {
    return convertBlobToSTL(glbBlob, filename, options);
  }, [convertBlobToSTL]);

  return {
    convertBlobToSTL,
    convertAndDownload,
    converter
  };
}
