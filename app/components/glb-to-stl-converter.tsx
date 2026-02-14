import React, { useCallback, useState } from 'react';
import { GLBToSTLConverter } from '~/utils/glb-to-stl-converter';

interface GLBToSTLConverterComponentProps {
  /** Optional GLB file URL to convert */
  glbUrl?: string;
  /** Optional callback when conversion is complete */
  onConversionComplete?: (filename: string) => void;
  /** Optional callback when conversion fails */
  onConversionError?: (error: Error) => void;
}

export default function GLBToSTLConverterComponent({
  glbUrl,
  onConversionComplete,
  onConversionError
}: GLBToSTLConverterComponentProps) {
  const [isConverting, setIsConverting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const converter = new GLBToSTLConverter();

  const handleConversion = useCallback(async (source: string | File, filename?: string) => {
    setIsConverting(true);
    try {
      const stlData = await converter.convertGLBToSTL(source, {
        binary: true, // Use binary STL for smaller files
        scale: 1,
        mergeGeometries: true
      });
      
      const outputFilename = filename || 
        (source instanceof File ? source.name.replace(/\.(glb|gltf)$/i, '.stl') : 'model.stl');
      
      converter.downloadSTL(stlData, outputFilename);
      onConversionComplete?.(outputFilename);
    } catch (error) {
      console.error('Conversion failed:', error);
      onConversionError?.(error as Error);
    } finally {
      setIsConverting(false);
    }
  }, [converter, onConversionComplete, onConversionError]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'model/gltf-binary' || file.name.toLowerCase().endsWith('.glb'))) {
      handleConversion(file);
    } else {
      alert('Please select a valid GLB file');
    }
  }, [handleConversion]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    
    const file = event.dataTransfer.files[0];
    if (file && (file.type === 'model/gltf-binary' || file.name.toLowerCase().endsWith('.glb'))) {
      handleConversion(file);
    } else {
      alert('Please drop a valid GLB file');
    }
  }, [handleConversion]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
  }, []);

  const handleConvertUrl = useCallback(() => {
    if (glbUrl) {
      handleConversion(glbUrl);
    }
  }, [glbUrl, handleConversion]);

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h3 className="text-lg font-semibold mb-4 text-center">GLB to STL Converter</h3>
      
      {/* File Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isConverting ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm text-gray-600">Converting GLB to STL...</p>
          </div>
        ) : (
          <>
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Drop a GLB file here, or{' '}
              <label className="text-blue-600 hover:text-blue-500 cursor-pointer">
                browse
                <input
                  type="file"
                  className="hidden"
                  accept=".glb,model/gltf-binary"
                  onChange={handleFileSelect}
                  disabled={isConverting}
                />
              </label>
            </p>
          </>
        )}
      </div>

      {/* URL Conversion */}
      {glbUrl && (
        <div className="mt-4">
          <button
            onClick={handleConvertUrl}
            disabled={isConverting}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Convert Current GLB Export to STL
          </button>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 text-xs text-gray-500">
        <p>• Binary STL format for smaller file sizes</p>
        <p>• All geometries are merged into a single mesh</p>
        <p>• Original scale is preserved</p>
      </div>
    </div>
  );
}
