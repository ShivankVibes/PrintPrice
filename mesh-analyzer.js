"use strict";

/**
 * 3D Mesh Analyzer & Volume Calculator for OBJ and STL files
 */
const MATERIAL_DENSITIES = {
    PLA: 1.24,
    PETG: 1.27,
    ABS: 1.04,
    ASA: 1.07,
    TPU: 1.21,
    Nylon: 1.14,
    Resin: 1.15,
    Other: 1.25
};

class MeshAnalyzer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.currentMesh = null;
        this.gridHelper = null;
        this.isInitialized = false;
    }

    /**
     * Initialize Three.js 3D Viewport
     */
    initViewer(canvasContainer) {
        if (!window.THREE) {
            console.error("Three.js not loaded");
            return;
        }

        const width = canvasContainer.clientWidth || 400;
        const height = canvasContainer.clientHeight || 300;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(
            document.documentElement.getAttribute("data-theme") === "dark" ? 0x17201f : 0xf8faf9
        );

        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
        this.camera.position.set(100, 100, 150);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;

        canvasContainer.innerHTML = "";
        canvasContainer.appendChild(this.renderer.domElement);

        // Orbit controls if available or fallback mouse rotate
        if (window.THREE.OrbitControls) {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
        }

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(150, 200, 100);
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x087f72, 0.3);
        dirLight2.position.set(-150, -100, -100);
        this.scene.add(dirLight2);

        // Build Plate Grid
        this.gridHelper = new THREE.GridHelper(200, 20, 0x087f72, 0xb8c3c0);
        this.gridHelper.position.y = 0;
        this.scene.add(this.gridHelper);

        this.isInitialized = true;

        // Render loop
        const animate = () => {
            requestAnimationFrame(animate);
            if (this.controls) this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();

        // Responsive resize
        window.addEventListener("resize", () => {
            if (!this.renderer || !canvasContainer) return;
            const w = canvasContainer.clientWidth;
            const h = canvasContainer.clientHeight || 300;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }

    updateTheme(isDark) {
        if (this.scene) {
            this.scene.background = new THREE.Color(isDark ? 0x17201f : 0xf8faf9);
        }
    }

    /**
     * Parse OBJ or STL file buffer/text into geometry & metrics
     */
    async analyzeFile(file) {
        const ext = file.name.split(".").pop().toLowerCase();
        let geometry = null;

        if (ext === "obj") {
            const text = await file.text();
            geometry = this.parseOBJ(text);
        } else if (ext === "stl") {
            const buffer = await file.arrayBuffer();
            geometry = this.parseSTL(buffer);
        } else {
            throw new Error("Unsupported file type. Please upload a .obj or .stl file.");
        }

        if (!geometry || geometry.vertices.length < 3) {
            throw new Error("Could not parse 3D geometry from file.");
        }

        // Calculate 3D metrics
        const metrics = this.computeMetrics(geometry);

        // Display in Three.js scene if initialized
        if (this.isInitialized && window.THREE) {
            this.displayInViewer(geometry, metrics.boundingBox);
        }

        return metrics;
    }

    /**
     * Parse Wavefront OBJ
     */
    parseOBJ(text) {
        const lines = text.split("\n");
        const rawVertices = [];
        const triangles = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith("#")) continue;

            const parts = line.split(/\s+/);
            const type = parts[0];

            if (type === "v") {
                rawVertices.push({
                    x: parseFloat(parts[1]) || 0,
                    y: parseFloat(parts[2]) || 0,
                    z: parseFloat(parts[3]) || 0
                });
            } else if (type === "f") {
                const faceIndices = [];
                for (let j = 1; j < parts.length; j++) {
                    const vertexIndex = parseInt(parts[j].split("/")[0], 10);
                    if (!isNaN(vertexIndex)) {
                        // OBJ is 1-indexed, negative indices count from end
                        const idx = vertexIndex > 0 ? vertexIndex - 1 : rawVertices.length + vertexIndex;
                        faceIndices.push(idx);
                    }
                }

                // Triangulate face if quad or polygon
                for (let j = 1; j < faceIndices.length - 1; j++) {
                    const v1 = rawVertices[faceIndices[0]];
                    const v2 = rawVertices[faceIndices[j]];
                    const v3 = rawVertices[faceIndices[j + 1]];
                    if (v1 && v2 && v3) {
                        triangles.push(v1, v2, v3);
                    }
                }
            }
        }

        return { vertices: triangles };
    }

    /**
     * Parse STL (Binary or ASCII)
     */
    parseSTL(buffer) {
        const isBinary = this.isSTLBinary(buffer);
        if (isBinary) {
            return this.parseSTLBinary(buffer);
        } else {
            const text = new TextDecoder().decode(buffer);
            return this.parseSTLAscii(text);
        }
    }

    isSTLBinary(buffer) {
        if (buffer.byteLength < 84) return false;
        const reader = new DataView(buffer);
        const numTriangles = reader.getUint32(80, true);
        const expectedSize = 84 + numTriangles * 50;
        return expectedSize === buffer.byteLength;
    }

    parseSTLBinary(buffer) {
        const reader = new DataView(buffer);
        const numTriangles = reader.getUint32(80, true);
        const triangles = [];
        let offset = 84;

        for (let i = 0; i < numTriangles; i++) {
            // Skip normal (12 bytes)
            offset += 12;

            for (let v = 0; v < 3; v++) {
                const x = reader.getFloat32(offset, true);
                const y = reader.getFloat32(offset + 4, true);
                const z = reader.getFloat32(offset + 8, true);
                offset += 12;
                triangles.push({ x, y, z });
            }

            // Skip attribute byte count (2 bytes)
            offset += 2;
        }

        return { vertices: triangles };
    }

    parseSTLAscii(text) {
        const triangles = [];
        const vertexRegex = /vertex\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)/g;
        let match;
        const pts = [];

        while ((match = vertexRegex.exec(text)) !== null) {
            pts.push({
                x: parseFloat(match[1]),
                y: parseFloat(match[2]),
                z: parseFloat(match[3])
            });
            if (pts.length === 3) {
                triangles.push(pts[0], pts[1], pts[2]);
                pts.length = 0;
            }
        }

        return { vertices: triangles };
    }

    /**
     * Compute Mesh Volume (cm3), Dimensions (mm), Surface Area, and Triangle Count
     */
    computeMetrics(geometry) {
        const vertices = geometry.vertices;
        let minX = Infinity,
            minY = Infinity,
            minZ = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity,
            maxZ = -Infinity;
        let totalSignedVolume = 0;

        for (let i = 0; i < vertices.length; i += 3) {
            const p1 = vertices[i];
            const p2 = vertices[i + 1];
            const p3 = vertices[i + 2];
            if (!p1 || !p2 || !p3) continue;

            // Bounding box
            minX = Math.min(minX, p1.x, p2.x, p3.x);
            minY = Math.min(minY, p1.y, p2.y, p3.y);
            minZ = Math.min(minZ, p1.z, p2.z, p3.z);
            maxX = Math.max(maxX, p1.x, p2.x, p3.x);
            maxY = Math.max(maxY, p1.y, p2.y, p3.y);
            maxZ = Math.max(maxZ, p1.z, p2.z, p3.z);

            // Signed volume of tetrahedron
            const v321 = p3.x * p2.y * p1.z;
            const v231 = p2.x * p3.y * p1.z;
            const v312 = p3.x * p1.y * p2.z;
            const v132 = p1.x * p3.y * p2.z;
            const v213 = p2.x * p1.y * p3.z;
            const v123 = p1.x * p2.y * p3.z;

            totalSignedVolume += (-v321 + v231 + v312 - v132 - v213 + v123) / 6.0;
        }

        const sizeX = Math.max(0, maxX - minX);
        const sizeY = Math.max(0, maxY - minY);
        const sizeZ = Math.max(0, maxZ - minZ);

        // Volume in mm3 -> cm3
        let volumeMm3 = Math.abs(totalSignedVolume);
        // Fallback if open/unclosed non-manifold mesh volume is near 0
        if (volumeMm3 < 1 && sizeX > 0 && sizeY > 0 && sizeZ > 0) {
            // Approx 40% bounding box volume as conservative fallback
            volumeMm3 = sizeX * sizeY * sizeZ * 0.4;
        }
        const volumeCm3 = volumeMm3 / 1000.0;

        return {
            triangleCount: Math.floor(vertices.length / 3),
            volumeCm3: Math.round(volumeCm3 * 100) / 100,
            volumeMm3: volumeMm3,
            dimensions: {
                x: Math.round(sizeX * 10) / 10,
                y: Math.round(sizeY * 10) / 10,
                z: Math.round(sizeZ * 10) / 10
            },
            boundingBox: { minX, minY, minZ, maxX, maxY, maxZ }
        };
    }

    /**
     * Estimate Filament Weight (grams) & Print Time (minutes)
     */
    estimatePrint(metrics, material = "PLA", infillPercent = 20) {
        const density = MATERIAL_DENSITIES[material] || 1.24;
        const infillRatio = Math.max(5, Math.min(100, infillPercent)) / 100;

        // Shell/walls + infill effective density factor (approx 15% solid shell + rest infill)
        const effectiveSolidRatio = 0.15 + 0.85 * infillRatio;

        // Weight in grams = Volume (cm3) * Density (g/cm3) * Effective Solid Ratio
        const rawWeight = metrics.volumeCm3 * density * effectiveSolidRatio;
        const weightGrams = Math.max(1, Math.round(rawWeight * 10) / 10);

        // Estimated Print Time (minutes)
        // Volumetric speed ~ 2500 mm3 per minute + height/layer time
        const effectiveVolumeMm3 = metrics.volumeMm3 * effectiveSolidRatio;
        const volumetricMinutes = effectiveVolumeMm3 / 2200;
        const heightMinutes = metrics.dimensions.z * 0.45;
        const prepTimeMinutes = 8; // bed heat + homing + prime line

        const totalMinutes = Math.max(15, Math.round(volumetricMinutes + heightMinutes + prepTimeMinutes));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return {
            weightGrams: weightGrams,
            printTimeMinutes: totalMinutes,
            hours: hours,
            minutes: minutes,
            formattedTime: `${hours}h ${minutes}m`
        };
    }

    /**
     * Display Geometry in Three.js Scene
     */
    displayInViewer(geometry, bbox) {
        if (!this.scene || !window.THREE) return;

        if (this.currentMesh) {
            this.scene.remove(this.currentMesh);
            if (this.currentMesh.geometry) this.currentMesh.geometry.dispose();
            if (this.currentMesh.material) this.currentMesh.material.dispose();
        }

        const bufferGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(geometry.vertices.length * 3);

        const centerX = (bbox.minX + bbox.maxX) / 2;
        const centerY = (bbox.minY + bbox.maxY) / 2;
        const minZ = bbox.minZ;

        for (let i = 0; i < geometry.vertices.length; i++) {
            const v = geometry.vertices[i];
            // Center X and Y, place bottom (min Z) on grid Y=0
            positions[i * 3] = v.x - centerX;
            positions[i * 3 + 1] = v.z - minZ; // Flip Z to Y (up)
            positions[i * 3 + 2] = -(v.y - centerY);
        }

        bufferGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        bufferGeo.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x087f72,
            roughness: 0.35,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        this.currentMesh = new THREE.Mesh(bufferGeo, material);
        this.scene.add(this.currentMesh);

        // Adjust camera to fit mesh size
        const maxDim = Math.max(
            bbox.maxX - bbox.minX,
            bbox.maxY - bbox.minY,
            bbox.maxZ - bbox.minZ,
            50
        );

        this.camera.position.set(maxDim * 1.5, maxDim * 1.3, maxDim * 1.8);
        this.camera.lookAt(0, (bbox.maxZ - bbox.minZ) / 2, 0);
        if (this.controls) {
            this.controls.target.set(0, (bbox.maxZ - bbox.minZ) / 2, 0);
            this.controls.update();
        }
    }
}

window.MeshAnalyzer = new MeshAnalyzer();
