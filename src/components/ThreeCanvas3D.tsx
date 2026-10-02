import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ThreeCanvas3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070B12, 0.0015);

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 80;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'mediump'
    });
    // Cap pixel ratio to 1.25 for buttery 60/120fps even on iGPUs
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 2. Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const emeraldLight = new THREE.PointLight(0x2D7F62, 3.5, 150);
    emeraldLight.position.set(30, 20, 40);
    scene.add(emeraldLight);

    const cyanLight = new THREE.PointLight(0x10B981, 2.5, 120);
    cyanLight.position.set(-30, -20, 30);
    scene.add(cyanLight);

    // 3. Floating 3D Geometries
    const group = new THREE.Group();
    scene.add(group);

    // Geometry 1: Large Wireframe Icosahedron
    const icoGeo = new THREE.IcosahedronGeometry(14, 1);
    const icoMat = new THREE.MeshStandardMaterial({
      color: 0x2D7F62,
      wireframe: true,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.35,
    });
    const icoMesh = new THREE.Mesh(icoGeo, icoMat);
    icoMesh.position.set(35, 10, -20);
    group.add(icoMesh);

    // Geometry 2: Floating Torus Knot
    const torusGeo = new THREE.TorusKnotGeometry(8, 2.2, 80, 16);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0x10B981,
      roughness: 0.3,
      metalness: 0.7,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.position.set(-38, -15, -10);
    group.add(torusMesh);

    // Geometry 3: Geometric Crystal Octahedron
    const octGeo = new THREE.OctahedronGeometry(9);
    const octMat = new THREE.MeshStandardMaterial({
      color: 0x34D399,
      roughness: 0.1,
      metalness: 0.9,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    const octMesh = new THREE.Mesh(octGeo, octMat);
    octMesh.position.set(28, -40, -15);
    group.add(octMesh);

    // Geometry 4: Small Cyber Dodecahedron
    const dodGeo = new THREE.DodecahedronGeometry(6);
    const dodMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      roughness: 0.4,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const dodMesh = new THREE.Mesh(dodGeo, dodMat);
    dodMesh.position.set(-25, 30, -5);
    group.add(dodMesh);

    // 4. 3D Floating Particle Field (Lightweight 350 particles)
    const particleCount = 350;
    const posArray = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 180;
      posArray[i + 1] = (Math.random() - 0.5) * 220;
      posArray[i + 2] = (Math.random() - 0.5) * 120;
    }

    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particlesMat = new THREE.PointsMaterial({
      size: 1.6,
      color: 0x34D399,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particlesMesh);

    // 5. Mouse Parallax (Interpolated)
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 6. Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // 7. Render Loop with High-Performance Smooth Interpolation
    let reqId: number;
    const startTime = performance.now();
    let currentScroll = window.scrollY || 0;

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const elapsedTime = (performance.now() - startTime) / 1000;

      // Smooth scroll interpolation to prevent micro-stutter
      const targetScroll = window.scrollY || 0;
      currentScroll += (targetScroll - currentScroll) * 0.1;

      // Mouse smooth interpolation
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      // 3D Rotations driven by continuous time + scroll
      icoMesh.rotation.x = elapsedTime * 0.18 + currentScroll * 0.0012;
      icoMesh.rotation.y = elapsedTime * 0.22 + currentScroll * 0.0015;

      torusMesh.rotation.x = elapsedTime * 0.12 - currentScroll * 0.0015;
      torusMesh.rotation.y = elapsedTime * 0.25 - currentScroll * 0.001;

      octMesh.rotation.x = elapsedTime * 0.3 + currentScroll * 0.002;
      octMesh.rotation.z = elapsedTime * 0.2;

      dodMesh.rotation.y = elapsedTime * 0.35 + currentScroll * 0.0018;
      dodMesh.rotation.x = elapsedTime * 0.2;

      // Particles gentle drift
      particlesMesh.rotation.y = elapsedTime * 0.03 + currentScroll * 0.0003;
      particlesMesh.rotation.x = currentScroll * 0.00015;

      // Camera 3D movement reacting to scroll depth
      const targetCamY = -currentScroll * 0.02;
      const targetCamZ = 80 + Math.sin(currentScroll * 0.001) * 10;

      camera.position.y += (targetCamY - camera.position.y) * 0.08;
      camera.position.z += (targetCamZ - camera.position.z) * 0.08;

      // Mouse Parallax smooth lerp
      camera.position.x += (mouseX * 4 - camera.position.x) * 0.05;
      camera.rotation.y = -mouseX * 0.025;
      camera.rotation.x = mouseY * 0.025;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      icoGeo.dispose();
      icoMat.dispose();
      torusGeo.dispose();
      torusMat.dispose();
      octGeo.dispose();
      octMat.dispose();
      dodGeo.dispose();
      dodMat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 pointer-events-none z-[1] overflow-hidden opacity-60 transition-opacity duration-1000 will-change-transform"
      style={{ transform: 'translateZ(0)' }}
      aria-hidden="true"
    />
  );
}
