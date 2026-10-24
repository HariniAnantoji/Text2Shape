import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MATERIALS } from '../textToShapeData';
import type { CadParams, MaterialKey } from '../types';

interface ThreeViewportProps {
  cadParams: CadParams;
  stlUrl: string | null;
  materialKey: MaterialKey;
  wireframe: boolean;
  xrayMode: boolean;
  showGrid: boolean;
  darkMode: boolean;
  onStlLoadError: (detail: string) => void;
}

function createBaseplatePreview(params: CadParams): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfLength = params.length / 2;
  const halfWidth = params.width / 2;

  shape.moveTo(-halfLength, -halfWidth);
  shape.lineTo(halfLength, -halfWidth);
  shape.lineTo(halfLength, halfWidth);
  shape.lineTo(-halfLength, halfWidth);
  shape.closePath();

  const holeX = halfLength - params.edgeOffset;
  const holeY = halfWidth - params.edgeOffset;
  for (const x of [-holeX, holeX]) {
    for (const y of [-holeY, holeY]) {
      const hole = new THREE.Path();
      hole.absarc(x, y, params.holeDiameter / 2, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: params.thickness,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -params.thickness / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function ThreeViewport({
  cadParams,
  stlUrl,
  materialKey,
  wireframe,
  xrayMode,
  showGrid,
  darkMode,
  onStlLoadError,
}: ThreeViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(darkMode ? 0x070a12 : 0xf1f5f9);

    const largestDimension = Math.max(cadParams.length, cadParams.width, cadParams.thickness);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, largestDimension * 10);
    camera.position.set(largestDimension * 1.4, largestDimension * 1.2, largestDimension * 1.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.replaceChildren(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, darkMode ? 0.7 : 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, darkMode ? 1.2 : 1.0);
    keyLight.position.set(50, 80, 50);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(darkMode ? 0x38bdf8 : 0x0284c7, 0.6);
    fillLight.position.set(-50, -30, -50);
    scene.add(fillLight);

    if (showGrid) {
      const gridSize = largestDimension * 1.6;
      const gridHelper = new THREE.GridHelper(
        gridSize,
        32,
        darkMode ? 0x334155 : 0xcbd5e1,
        darkMode ? 0x1e293b : 0xe2e8f0,
      );
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.z = -cadParams.thickness / 2 - 5;
      scene.add(gridHelper);
    }

    const materialConfig = MATERIALS[materialKey];
    const meshMaterial = new THREE.MeshStandardMaterial({
      color: darkMode ? materialConfig.colorDark : materialConfig.colorLight,
      metalness: materialConfig.metalness,
      roughness: materialConfig.roughness,
      wireframe,
      transparent: xrayMode,
      opacity: xrayMode ? 0.45 : 1,
      side: THREE.DoubleSide,
    });

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    let active = true;
    const previewGeometry = createBaseplatePreview(cadParams);
    const previewMesh = new THREE.Mesh(previewGeometry, meshMaterial);
    modelGroup.add(previewMesh);

    if (stlUrl) {
      new STLLoader().load(
        stlUrl,
        (geometry) => {
          if (!active) {
            geometry.dispose();
            return;
          }
          geometry.computeVertexNormals();
          geometry.center();
          modelGroup.remove(previewMesh);
          previewGeometry.dispose();
          modelGroup.add(new THREE.Mesh(geometry, meshMaterial));
        },
        undefined,
        (error) => {
          if (active) {
            onStlLoadError(error instanceof Error ? error.message : 'The server returned an unreadable STL file.');
          }
        },
      );
    }

    camera.lookAt(0, 0, 0);

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const domElement = renderer.domElement;
    const handleMouseDown = (event: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: event.clientX, y: event.clientY };
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      modelGroup.rotation.y += (event.clientX - previousMousePosition.x) * 0.01;
      modelGroup.rotation.x += (event.clientY - previousMousePosition.y) * 0.01;
      previousMousePosition = { x: event.clientX, y: event.clientY };
    };
    const handleMouseUp = () => {
      isDragging = false;
    };
    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isDragging) modelGroup.rotation.y += 0.003;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const resizedWidth = container.clientWidth;
      const resizedHeight = container.clientHeight;
      camera.aspect = resizedWidth / resizedHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(resizedWidth, resizedHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      for (const child of modelGroup.children) {
        if (child instanceof THREE.Mesh && child.geometry !== previewGeometry) {
          child.geometry.dispose();
        }
      }
      previewGeometry.dispose();
      meshMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [cadParams, stlUrl, materialKey, wireframe, xrayMode, showGrid, darkMode, onStlLoadError]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}
