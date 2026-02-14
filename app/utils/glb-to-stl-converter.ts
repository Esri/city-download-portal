/*
 * GLB to STL Converter Utility
 * 
 * This module provides functionality to load GLB files using Three.js
 * and convert them to STL format for 3D printing or other applications.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ConversionOptions {
  /** Whether to export as binary STL (smaller file) or ASCII STL (human readable) */
  binary?: boolean;
  /** Scale factor to apply to the model */
  scale?: number;
  /** Whether to merge all geometries into a single mesh */
  mergeGeometries?: boolean;
}

export class GLBToSTLConverter {
  private loader: GLTFLoader;
  private exporter: STLExporter;

  constructor() {
    this.loader = new GLTFLoader();
    this.exporter = new STLExporter();
  }

  /**
   * Normalize geometry attributes to ensure compatibility for merging
   */
  private normalizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const normalized = geometry.clone();
    
    // Ensure normals exist
    if (!normalized.attributes.normal) {
      normalized.computeVertexNormals();
    }
    
    // Ensure UV coordinates exist (STL doesn't need them, but merging might require consistency)
    if (!normalized.attributes.uv) {
      const positions = normalized.attributes.position;
      const uvs = new Float32Array(positions.count * 2);
      normalized.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    
    // Remove any attributes that might cause issues
    const attributesToKeep = ['position', 'normal', 'uv'];
    const attributesToRemove = Object.keys(normalized.attributes).filter(
      attr => !attributesToKeep.includes(attr)
    );
    
    attributesToRemove.forEach(attr => {
      normalized.deleteAttribute(attr);
    });
    
    return normalized;
  }

  /**
   * Load a GLB file from a URL or File object
   */
  async loadGLB(source: string | File): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      if (source instanceof File) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          this.loader.parse(
            arrayBuffer,
            '',
            (gltf) => resolve(gltf.scene),
            (error) => reject(error)
          );
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(source);
      } else {
        this.loader.load(
          source,
          (gltf) => resolve(gltf.scene),
          undefined,
          (error) => reject(error)
        );
      }
    });
  }

  /**
   * Convert a Three.js scene/group to STL format
   */
  convertToSTL(scene: THREE.Group, options: ConversionOptions = {}): string | DataView {
    const { binary = true, scale = 1, mergeGeometries = true } = options;

    // Apply scaling if needed
    if (scale !== 1) {
      scene.scale.multiplyScalar(scale);
    }

    if (mergeGeometries) {
      // Collect all mesh geometries
      const geometries: THREE.BufferGeometry[] = [];
      const materials: THREE.Material[] = [];

      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          try {
            // Apply the mesh's world matrix to the geometry
            const geometry = child.geometry.clone();
            child.updateMatrixWorld();
            geometry.applyMatrix4(child.matrixWorld);
            
            // Normalize the geometry to ensure consistent attributes
            const normalizedGeometry = this.normalizeGeometry(geometry);
            
            geometries.push(normalizedGeometry);
            materials.push(child.material as THREE.Material);
          } catch (error) {
            console.warn('Skipping problematic geometry:', error);
            // Skip this geometry if it can't be processed
          }
        }
      });

      if (geometries.length === 0) {
        throw new Error('No mesh geometries found in the scene');
      }

      try {
        // Merge all geometries
        const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
        if (!mergedGeometry) {
          throw new Error('Failed to merge geometries');
        }

        // Create a new mesh with merged geometry
        const mergedMesh = new THREE.Mesh(mergedGeometry);
        return this.exporter.parse(mergedMesh, { binary });
      } catch (error) {
        console.warn('Failed to merge geometries, exporting individual meshes:', error);
        // Fallback: export without merging
        return this.exporter.parse(scene, { binary });
      }
    } else {
      // Export the entire scene
      return this.exporter.parse(scene, { binary });
    }
  }

  /**
   * Complete conversion from GLB to STL
   */
  async convertGLBToSTL(
    source: string | File,
    options: ConversionOptions = {}
  ): Promise<string | DataView> {
    const scene = await this.loadGLB(source);
    return this.convertToSTL(scene, options);
  }

  /**
   * Download the STL file
   */
  downloadSTL(stlData: string | DataView, filename: string = 'model.stl'): void {
    let blob: Blob;
    
    if (typeof stlData === 'string') {
      blob = new Blob([stlData], { type: 'text/plain' });
    } else {
      // Convert DataView to Uint8Array for the blob
      const uint8Array = new Uint8Array(stlData.buffer, stlData.byteOffset, stlData.byteLength);
      blob = new Blob([uint8Array], { type: 'application/octet-stream' });
    }
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Utility function for quick conversion
 */
export const convertGLBToSTL = async (
  source: string | File,
  options: ConversionOptions = {}
): Promise<string | DataView> => {
  const converter = new GLBToSTLConverter();
  return converter.convertGLBToSTL(source, options);
};

/**
 * Utility function to convert and immediately download
 */
export const convertAndDownloadSTL = async (
  source: string | File,
  filename: string = 'model.stl',
  options: ConversionOptions = {}
): Promise<void> => {
  const converter = new GLBToSTLConverter();
  const stlData = await converter.convertGLBToSTL(source, options);
  converter.downloadSTL(stlData, filename);
};
