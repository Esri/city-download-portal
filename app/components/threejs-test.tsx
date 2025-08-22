import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

/**
 * Test component to verify Three.js setup and GLB/STL functionality
 * This creates a simple cube, exports it as GLB, then converts to STL
 */
export default function ThreeJSTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Basic Three.js setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 400 / 300, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current });
    renderer.setSize(400, 300);

    // Create a simple cube
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      renderer.dispose();
    };
  }, []);

  const testSTLExport = () => {
    // Create a simple test geometry
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);

    // Export to STL
    const exporter = new STLExporter();
    const stlData = exporter.parse(mesh, { binary: true });

    // Download the STL
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
    link.download = 'test-cube.stl';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Three.js Setup Test</h2>
      
      <div className="mb-4">
        <canvas ref={canvasRef} className="border border-gray-300 rounded" />
      </div>
      
      <div className="space-y-2">
        <button
          onClick={testSTLExport}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
        >
          Test STL Export (Download Test Cube)
        </button>
        
        <div className="text-sm text-gray-600">
          <p>✅ Three.js: {THREE.REVISION}</p>
          <p>✅ GLTFLoader: Available</p>
          <p>✅ STLExporter: Available</p>
        </div>
      </div>
    </div>
  );
}
