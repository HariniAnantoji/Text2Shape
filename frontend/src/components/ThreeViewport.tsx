import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MATERIALS } from '../textToShapeData';
import type { CadParams, HoleFeature, MaterialKey, PrimitiveFeature } from '../types';

interface ThreeViewportProps {
  cadParams: CadParams;
  features: PrimitiveFeature[];
  holes: HoleFeature[];
  stlUrl: string | null;
  materialKey: MaterialKey;
  wireframe: boolean;
  xrayMode: boolean;
  showGrid: boolean;
  showDimensions: boolean;
  darkMode: boolean;
  onStlLoadError: (detail: string) => void;
}

function createModelPreview(params: CadParams, features: PrimitiveFeature[], holes: HoleFeature[]) {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
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
    for (const hole of holes) {
      const customHole = new THREE.Path();
      customHole.absarc(hole.x - params.x, hole.y - params.y, hole.diameter / 2, 0, Math.PI * 2, true);
      shape.holes.push(customHole);
    }
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: params.thickness,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -params.thickness / 2);
  geometry.translate(params.x, params.y, params.z);
  geometry.computeVertexNormals();
  geometries.push(geometry);
  group.add(new THREE.Mesh(geometry));

  for (const feature of features) {
    let featureGeometry: THREE.BufferGeometry;
    if (feature.shape === 'box') {
      featureGeometry = new THREE.BoxGeometry(feature.length, feature.width, feature.height);
    } else if (feature.shape === 'cylinder') {
      featureGeometry = new THREE.CylinderGeometry(
        feature.diameter / 2,
        feature.diameter / 2,
        feature.height,
        32,
      );
      featureGeometry.rotateX(Math.PI / 2);
    } else {
      featureGeometry = new THREE.SphereGeometry(feature.diameter / 2, 24, 16);
    }
    featureGeometry.translate(feature.x, feature.y, feature.z);
    geometries.push(featureGeometry);
    group.add(new THREE.Mesh(featureGeometry));
  }

  return { group, geometries };
}

export function ThreeViewport({
  cadParams,
  features,
  holes,
  stlUrl,
  materialKey,
  wireframe,
  xrayMode,
  showGrid,
  showDimensions,
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

    const bounds = {
      minX: cadParams.x - cadParams.length / 2,
      maxX: cadParams.x + cadParams.length / 2,
      minY: cadParams.y - cadParams.width / 2,
      maxY: cadParams.y + cadParams.width / 2,
      minZ: cadParams.z - cadParams.thickness / 2,
      maxZ: cadParams.z + cadParams.thickness / 2,
    };
    for (const feature of features) {
      const halfX = feature.shape === 'box' ? feature.length / 2 : feature.diameter / 2;
      const halfY = feature.shape === 'box' ? feature.width / 2 : feature.diameter / 2;
      const halfZ = feature.shape === 'box'
        ? feature.height / 2
        : feature.shape === 'cylinder'
          ? feature.height / 2
          : feature.diameter / 2;
      bounds.minX = Math.min(bounds.minX, feature.x - halfX);
      bounds.maxX = Math.max(bounds.maxX, feature.x + halfX);
      bounds.minY = Math.min(bounds.minY, feature.y - halfY);
      bounds.maxY = Math.max(bounds.maxY, feature.y + halfY);
      bounds.minZ = Math.min(bounds.minZ, feature.z - halfZ);
      bounds.maxZ = Math.max(bounds.maxZ, feature.z + halfZ);
    }
    const center = new THREE.Vector3(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2,
    );
    const largestDimension = Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
      bounds.maxZ - bounds.minZ,
    );
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, largestDimension * 10);
    camera.position.set(largestDimension * 1.4, largestDimension * 1.2, largestDimension * 1.6);
    camera.lookAt(0, 0, 0);

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
      gridHelper.position.set(-center.x, -center.y, cadParams.z - cadParams.thickness / 2 - 5 - center.z);
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
    modelGroup.position.copy(center).negate();
    scene.add(modelGroup);
    let active = true;
    const preview = createModelPreview(cadParams, features, holes);
    preview.group.children.forEach((child) => {
      if (child instanceof THREE.Mesh) child.material = meshMaterial;
    });
    const previewGroup = preview.group;
    modelGroup.add(previewGroup);
    let previewDisposed = false;
    const disposePreview = () => {
      if (previewDisposed) return;
      preview.geometries.forEach((previewGeometry) => previewGeometry.dispose());
      previewDisposed = true;
    };

    if (stlUrl) {
      new STLLoader().load(
        stlUrl,
        (geometry) => {
          if (!active) {
            geometry.dispose();
            return;
          }
          geometry.computeVertexNormals();
          previewGroup.removeFromParent();
          disposePreview();
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
      disposePreview();
      modelGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
        }
      });
      meshMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [cadParams, features, holes, stlUrl, materialKey, wireframe, xrayMode, showGrid, showDimensions, darkMode, onStlLoadError]);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      {showDimensions && (
        <div className="pointer-events-none absolute bottom-4 right-4 max-w-64 rounded-lg border border-cyan-500/30 bg-slate-950/80 p-2 font-mono text-[10px] text-cyan-200">
          <div>{`PLATE ${cadParams.length} × ${cadParams.width} × ${cadParams.thickness} mm`}</div>
          <div>{`HOLES 4 × Ø${cadParams.holeDiameter} mm`}</div>
          {features.map((feature, index) => (
            <div key={feature.id}>
              {`${index + 1}: ${feature.shape} ${feature.shape === 'box'
                ? `${feature.length} × ${feature.width} × ${feature.height}`
                : feature.shape === 'cylinder'
                  ? `Ø${feature.diameter} × ${feature.height}`
                  : `Ø${feature.diameter}`} mm @ ${feature.x}, ${feature.y}, ${feature.z}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
