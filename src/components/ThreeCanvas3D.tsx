import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeCanvas3DProps {
  scrollY: number;
}

export default function ThreeCanvas3D({ scrollY }: ThreeCanvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(scrollY);
  scrollRef.current = scrollY;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070B12, 0.0018);

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
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 2. Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const emeraldLight = new THREE.PointLight(0x2D7F62, 4, 150);
    emeraldLight.position.set(30, 20, 40);
    scene.add(emeraldLight);

    const cyanLight = new THREE.PointLight(0x10B981, 3, 120);
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
    const torusGeo = new THREE.TorusKnotGeometry(8, 2.2, 100, 16);
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

    // 4. 3D Floating Particle Field
    const particleCount = 450;
    const posArray = new Float32Array(particleCount * 3);
    const scaleArray = new Float32Array(particleCount);

    for (let i = 0; i < particleCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 180;
      posArray[i + 1] = (Math.random() - 0.5) * 220;
      posArray[i + 2] = (Math.random() - 0.5) * 120;
      scaleArray[i / 3] = Math.random() * 2 + 1;
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

    // 5. Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 6. Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // 7. Render Loop with 3D Scroll Dynamics
    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const currentScroll = scrollRef.current;

      // 3D Rotations driven by continuous time + scroll acceleration
      icoMesh.rotation.x = elapsedTime * 0.18 + currentScroll * 0.0015;
      icoMesh.rotation.y = elapsedTime * 0.22 + currentScroll * 0.002;

      torusMesh.rotation.x = elapsedTime * 0.12 - currentScroll * 0.0018;
      torusMesh.rotation.y = elapsedTime * 0.25 - currentScroll * 0.0012;

      octMesh.rotation.x = elapsedTime * 0.3 + currentScroll * 0.0025;
      octMesh.rotation.z = elapsedTime * 0.2;

      dodMesh.rotation.y = elapsedTime * 0.35 + currentScroll * 0.002;
      dodMesh.rotation.x = elapsedTime * 0.2;

      // Particles gentle drift
      particlesMesh.rotation.y = elapsedTime * 0.03 + currentScroll * 0.0004;
      particlesMesh.rotation.x = currentScroll * 0.0002;

      // Camera 3D movement reacting to scroll depth
      const targetCamY = -currentScroll * 0.025;
      const targetCamZ = 80 + Math.sin(currentScroll * 0.0015) * 12;

      camera.position.y += (targetCamY - camera.position.y) * 0.06;
      camera.position.z += (targetCamZ - camera.position.z) * 0.06;

      // Mouse Parallax smooth lerp
      camera.position.x += (mouseX * 5 - camera.position.x) * 0.04;
      camera.rotation.y = -mouseX * 0.03;
      camera.rotation.x = mouseY * 0.03;

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
      className="fixed inset-0 pointer-events-none z-[1] overflow-hidden opacity-60 transition-opacity duration-1000"
      aria-hidden="true"
    />
  );
}
