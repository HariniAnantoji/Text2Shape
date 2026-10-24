import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MATERIALS } from '../textToShapeData';
import type { CadParams, MaterialKey } from '../types';

// --- THREE.JS 3D VIEWPORT COMPONENT ---
interface ThreeViewportProps {
  cadParams: CadParams;
  materialKey: MaterialKey;
  wireframe: boolean;
  xrayMode: boolean;
  showGrid: boolean;
  explodedView: boolean;
  darkMode: boolean;
}

export function ThreeViewport({
  cadParams,
  materialKey,
  wireframe,
  xrayMode,
  showGrid,
  explodedView,
  darkMode
}: ThreeViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // Scene & Camera setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(darkMode ? 0x070a12 : 0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(60, 50, 70);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // Clear previous elements
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, darkMode ? 0.7 : 1.1);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, darkMode ? 1.2 : 1.0);
    dirLight1.position.set(50, 80, 50);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(darkMode ? 0x38bdf8 : 0x0284c7, 0.6);
    dirLight2.position.set(-50, -30, -50);
    scene.add(dirLight2);

    // Grid Floor
    let gridHelper;
    if (showGrid) {
      gridHelper = new THREE.GridHelper(160, 32, darkMode ? 0x334155 : 0xcbd5e1, darkMode ? 0x1e293b : 0xe2e8f0);
      gridHelper.position.y = -cadParams.extrusionDepth / 2 - 5;
      scene.add(gridHelper);
    }

    // Material definition
    const matConfig = MATERIALS[materialKey] || MATERIALS.steel;
    const materialColor = darkMode ? matConfig.colorDark : matConfig.colorLight;

    const meshMaterial = new THREE.MeshStandardMaterial({
      color: materialColor,
      metalness: matConfig.metalness,
      roughness: matConfig.roughness,
      wireframe: wireframe,
      transparent: xrayMode,
      opacity: xrayMode ? 0.45 : 1.0,
      side: THREE.DoubleSide
    });

    // Model Grouping
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Build Parametric Spur Gear Geometry Shape
    const shape = new THREE.Shape();
    const teeth = cadParams.teethCount;
    const outerR = cadParams.outerRadius;
    const innerR = outerR * 0.82;

    for (let i = 0; i < teeth; i++) {
      const angle1 = (i / teeth) * Math.PI * 2;
      const angle2 = ((i + 0.25) / teeth) * Math.PI * 2;
      const angle3 = ((i + 0.5) / teeth) * Math.PI * 2;
      const angle4 = ((i + 0.75) / teeth) * Math.PI * 2;

      const r1 = innerR;
      const r2 = outerR;

      if (i === 0) {
        shape.moveTo(Math.cos(angle1) * r1, Math.sin(angle1) * r1);
      } else {
        shape.lineTo(Math.cos(angle1) * r1, Math.sin(angle1) * r1);
      }
      shape.lineTo(Math.cos(angle2) * r2, Math.sin(angle2) * r2);
      shape.lineTo(Math.cos(angle3) * r2, Math.sin(angle3) * r2);
      shape.lineTo(Math.cos(angle4) * r1, Math.sin(angle4) * r1);
    }

    // Center Bore Hole
    const holePath = new THREE.Path();
    const holeR = cadParams.boreDiameter / 2;
    holePath.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(holePath);

    // Optional Mounting Holes
    if (cadParams.mountingHoles) {
      const offset = outerR * 0.5;
      const holePositions = [
        [-offset, -offset],
        [offset, -offset],
        [offset, offset],
        [-offset, offset]
      ];
      holePositions.forEach(([hx, hy]) => {
        const mHole = new THREE.Path();
        mHole.absarc(hx, hy, 3, 0, Math.PI * 2, true);
        shape.holes.push(mHole);
      });
    }

    const extrudeSettings = {
      steps: 1,
      depth: cadParams.extrusionDepth,
      bevelEnabled: cadParams.filletRadius > 0,
      bevelThickness: Math.min(cadParams.filletRadius, 3),
      bevelSize: Math.min(cadParams.filletRadius, 3),
      bevelOffset: 0,
      bevelSegments: 3
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();

    const gearMesh = new THREE.Mesh(geometry, meshMaterial);
    modelGroup.add(gearMesh);

    // Exploded Shaft Assembly (if enabled)
    if (explodedView) {
      const shaftGeo = new THREE.CylinderGeometry(holeR - 0.2, holeR - 0.2, cadParams.extrusionDepth * 1.8, 32);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: darkMode ? 0x38bdf8 : 0x0284c7,
        metalness: 0.9,
        roughness: 0.1
      });
      const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
      shaftMesh.position.y = cadParams.extrusionDepth + 15;
      modelGroup.add(shaftMesh);
    }

    // Camera Look At Target
    camera.lookAt(0, 0, 0);

    // Simple Mouse Drag Orbit Navigation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaMove = {
        x: e.clientX - previousMousePosition.x,
        y: e.clientY - previousMousePosition.y
      };

      modelGroup.rotation.y += deltaMove.x * 0.01;
      modelGroup.rotation.x += deltaMove.y * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => { isDragging = false; };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isDragging) {
        modelGroup.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Window Resize handling
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domEl.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      meshMaterial.dispose();
      renderer.dispose();
    };
  }, [cadParams, materialKey, wireframe, xrayMode, showGrid, explodedView, darkMode]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}
