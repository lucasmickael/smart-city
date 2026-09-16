
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

    // ============================================================
    // CONFIGURAÇÕES GERAIS
    // ============================================================
    const CS = 240; // City Size
    const BS = 28;  // Block Size
    const RW = 8;   // Road Width
    const SW = 2;   // Sidewalk Width
    
    let scene, camera, renderer, controls;
    let pmremGenerator, envMap;
    let clock = new THREE.Clock();
    let cityTime = 14.5; // Começa 14:30
    let timeSpeed = 1;

    // Arrays de atualização
    const cars = [];
    const buses = [];
    const materialsToUpdate = [];
    const streetLights = [];
    const windowMaterials = [];

    // A chamada do init() foi movida para o final do arquivo

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    function init() {
        const canvas = document.getElementById('canvas3d');
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Configurações para realismo (Maquete)
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0f18);
        scene.fog = new THREE.FogExp2(0x0a0f18, 0.002);

        // Ambiente de Reflexão (Gera reflexos realistas nos vidros)
        pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        envMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envMap;

        camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 1000);
        camera.position.set(120, 100, 150);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1; // Não deixa ir para baixo do chão
        controls.minDistance = 10;
        controls.maxDistance = 400;
        controls.target.set(0, 0, 0);

        setupLighting();
        generateTexturesAndMaterials();
        buildCity();

        // UI Events
        document.getElementById('btnPause').onclick = (e) => setSpeed(0, e.target);
        document.getElementById('btnPlay').onclick = (e) => setSpeed(1, e.target);
        document.getElementById('btnFast').onclick = (e) => setSpeed(8, e.target);
        window.addEventListener('resize', onResize);

        // Remove loading
        setTimeout(() => document.getElementById('loading').classList.add('hidden'), 500);

        animate();
    }

    function setSpeed(s, btn) {
        timeSpeed = s;
        document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    // ============================================================
    // LUZES
    // ============================================================
    let sunLight, hemiLight;
    function setupLighting() {
        hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.4);
        scene.add(hemiLight);

        sunLight = new THREE.DirectionalLight(0xfff5e6, 2.5);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 400;
        const d = 150;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.bias = -0.0005;
        sunLight.shadow.normalBias = 0.02;
        scene.add(sunLight);
    }

    // ============================================================
    // GERADOR DE TEXTURAS PROCESSUAIS (Canvas)
    // ============================================================
    const textures = {};
    const mats = {};

    function generateTexturesAndMaterials() {
        // 1. Textura de Asfalto com Faixas
        const roadCnv = document.createElement('canvas');
        roadCnv.width = 512; roadCnv.height = 512;
        const rctx = roadCnv.getContext('2d');
        
        // Fundo asfalto (ruído)
        rctx.fillStyle = '#222'; rctx.fillRect(0,0,512,512);
        for(let i=0; i<20000; i++){
            rctx.fillStyle = Math.random()>0.5 ? '#282828':'#1c1c1c';
            rctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
        }
        // Linhas tracejadas (centro)
        rctx.fillStyle = '#ddd';
        for(let y=0; y<512; y+=64) rctx.fillRect(252, y+16, 8, 32);
        
        textures.roadVert = new THREE.CanvasTexture(roadCnv);
        textures.roadVert.wrapS = textures.roadVert.wrapT = THREE.RepeatWrapping;
        textures.roadVert.repeat.set(1, 10);
        
        // Rotacionar para vias horizontais
        const r2Cnv = document.createElement('canvas');
        r2Cnv.width = 512; r2Cnv.height = 512;
        const r2ctx = r2Cnv.getContext('2d');
        r2ctx.translate(256, 256); r2ctx.rotate(Math.PI/2); r2ctx.translate(-256, -256);
        r2ctx.drawImage(roadCnv, 0, 0);
        textures.roadHoriz = new THREE.CanvasTexture(r2Cnv);
        textures.roadHoriz.wrapS = textures.roadHoriz.wrapT = THREE.RepeatWrapping;
        textures.roadHoriz.repeat.set(10, 1);

        // 2. Textura de Cruzamento (Faixas de pedestre)
        const crossCnv = document.createElement('canvas');
        crossCnv.width = 512; crossCnv.height = 512;
        const cctx = crossCnv.getContext('2d');
        cctx.drawImage(roadCnv, 0,0);
        cctx.fillStyle = '#ddd';
        // 4 faixas de pedestres nas bordas
        for(let i=64; i<448; i+=32) {
            cctx.fillRect(i, 20, 16, 60); // Top
            cctx.fillRect(i, 432, 16, 60); // Bot
            cctx.fillRect(20, i, 60, 16); // Left
            cctx.fillRect(432, i, 60, 16); // Right
        }
        textures.crosswalk = new THREE.CanvasTexture(crossCnv);

        // 3. Texturas de Fachada de Prédio (Janelas)
        textures.windows = [];
        for (let t=0; t<3; t++) {
            const wCnv = document.createElement('canvas');
            wCnv.width = 512; wCnv.height = 512;
            const wctx = wCnv.getContext('2d');
            
            // Fundo da parede
            const wallColors = ['#1a1a24', '#2a2a2a', '#1e252b'];
            wctx.fillStyle = wallColors[t]; wctx.fillRect(0,0,512,512);
            
            // Desenhar janelas
            for (let y = 16; y < 512; y += 64) {
                for (let x = 16; x < 512; x += 48) {
                    const isLit = Math.random() > 0.7; // 30% das janelas acesas
                    // Reflexo do vidro apagado ou luz acesa
                    wctx.fillStyle = isLit ? '#ffebb5' : '#0a0a0c';
                    wctx.fillRect(x, y, 32, 48);
                    
                    // Se acesa, colocar um glow suave
                    if(isLit) {
                        wctx.fillStyle = 'rgba(255, 235, 181, 0.4)';
                        wctx.fillRect(x-4, y-4, 40, 56);
                    } else {
                        // Cortinas sutis
                        if(Math.random()>0.5) {
                            wctx.fillStyle = '#151515';
                            wctx.fillRect(x, y, 16, 48);
                        }
                    }
                }
            }
            const tex = new THREE.CanvasTexture(wCnv);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            textures.windows.push(tex);
        }

        // Materiais Base
        mats.asphaltVert = new THREE.MeshStandardMaterial({ map: textures.roadVert, roughness: 0.8, metalness: 0.1 });
        mats.asphaltHoriz = new THREE.MeshStandardMaterial({ map: textures.roadHoriz, roughness: 0.8, metalness: 0.1 });
        mats.asphaltCross = new THREE.MeshStandardMaterial({ map: textures.crosswalk, roughness: 0.8, metalness: 0.1 });
        
        mats.sidewalk = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.9 });
        mats.grass = new THREE.MeshStandardMaterial({ color: 0x3b5e32, roughness: 1.0 });
        mats.concrete = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });
        mats.darkConcrete = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
        
        // Materiais dos prédios com ambiente map para reflexo de vidro
        mats.buildings = textures.windows.map(tex => {
            const mat = new THREE.MeshStandardMaterial({ 
                map: tex, 
                roughness: 0.1, // Vidro muito liso
                metalness: 0.8, // Altamente reflexivo
                envMap: envMap,
                envMapIntensity: 1.5
            });
            windowMaterials.push(mat);
            return mat;
        });
    }

    // ============================================================
    // CONSTRUÇÃO DA CIDADE
    // ============================================================
    function buildCity() {
        // Chão Base
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(CS*1.5, CS*1.5), mats.grass);
        ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
        scene.add(ground);

        // Malha Viária
        const gridBlocks = 6;
        const totalSpacing = BS + RW;
        const startOffset = - (gridBlocks * totalSpacing) / 2 + totalSpacing / 2;

        for (let i = 0; i < gridBlocks; i++) {
            for (let j = 0; j < gridBlocks; j++) {
                const cx = startOffset + i * totalSpacing;
                const cz = startOffset + j * totalSpacing;

                // Construir o Quarteirão (Calçada + Miolo)
                buildBlock(cx, cz);

                // Cruzamentos
                const cross = new THREE.Mesh(new THREE.PlaneGeometry(RW, RW), mats.asphaltCross);
                cross.rotation.x = -Math.PI/2; cross.position.set(cx + BS/2 + RW/2, 0.01, cz + BS/2 + RW/2);
                cross.receiveShadow = true; scene.add(cross);
            }
            // Vias Horizontais
            const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(CS, RW), mats.asphaltHoriz);
            hRoad.rotation.x = -Math.PI/2; hRoad.position.set(0, 0.005, startOffset + i * totalSpacing + BS/2 + RW/2);
            hRoad.receiveShadow = true; scene.add(hRoad);
            
            // Vias Verticais
            const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(RW, CS), mats.asphaltVert);
            vRoad.rotation.x = -Math.PI/2; vRoad.position.set(startOffset + i * totalSpacing + BS/2 + RW/2, 0.006, 0);
            vRoad.receiveShadow = true; scene.add(vRoad);
        }

        // Iluminação de Rua
        buildStreetLights(gridBlocks, startOffset, totalSpacing);

        // Veículos
        spawnCars();
    }

    function buildBlock(cx, cz) {
        // Calçada
        const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(BS, 0.2, BS), mats.sidewalk);
        sidewalk.position.set(cx, 0.1, cz);
        sidewalk.receiveShadow = true;
        scene.add(sidewalk);

        // Miolo do quarteirão (Praça ou Prédios)
        const isPark = Math.random() > 0.85;

        if (isPark) {
            // Praça
            const park = new THREE.Mesh(new THREE.BoxGeometry(BS-2, 0.25, BS-2), mats.grass);
            park.position.set(cx, 0.125, cz); park.receiveShadow = true; scene.add(park);
            
            // Árvores detalhadas
            for(let t=0; t<12; t++) {
                const tree = createDetailedTree();
                tree.position.set(cx + (Math.random()-0.5)*(BS-4), 0.25, cz + (Math.random()-0.5)*(BS-4));
                scene.add(tree);
            }
        } else {
            // Complexo de Prédios
            const numBldgs = 1 + Math.floor(Math.random() * 3);
            for(let b=0; b<numBldgs; b++) {
                const bw = 6 + Math.random() * 10;
                const bd = 6 + Math.random() * 10;
                // Distância do centro afeta a altura
                const distToCenter = Math.sqrt(cx*cx + cz*cz);
                const maxH = Math.max(10, 80 - distToCenter*0.4);
                const bh = 10 + Math.random() * maxH;

                const ox = (Math.random()-0.5)*(BS - bw - 2);
                const oz = (Math.random()-0.5)*(BS - bd - 2);
                
                const bldg = createArchitecturalBuilding(bw, bd, bh);
                bldg.position.set(cx + ox, 0.2, cz + oz);
                scene.add(bldg);
            }
        }
    }

    function createArchitecturalBuilding(w, d, h) {
        const group = new THREE.Group();
        
        // Material de fachada
        const facadeMat = mats.buildings[Math.floor(Math.random() * mats.buildings.length)];
        // Repetição da textura baseada no tamanho
        const matClone = facadeMat.clone();
        matClone.map = matClone.map.clone();
        matClone.map.repeat.set(w/4, h/4);
        windowMaterials.push(matClone);

        // Bloco Principal
        const bodyGeo = new THREE.BoxGeometry(w, h, d);
        const body = new THREE.Mesh(bodyGeo, matClone);
        body.position.y = h/2;
        body.castShadow = true; body.receiveShadow = true;
        group.add(body);

        // Térreo Comercial (Pé direito alto, vidro transparente ou concreto escuro)
        const groundH = 2.5;
        const groundGeo = new THREE.BoxGeometry(w+0.2, groundH, d+0.2);
        const groundMesh = new THREE.Mesh(groundGeo, mats.darkConcrete);
        groundMesh.position.y = groundH/2;
        groundMesh.castShadow = true;
        group.add(groundMesh);

        // Detalhes no Telhado (Ar condicionado, caixa d'água, antenas)
        const roofItems = new THREE.Group();
        roofItems.position.y = h;
        
        // Borda do telhado (Platibanda)
        const borderGeo = new THREE.BoxGeometry(w, 0.5, d);
        const border = new THREE.Mesh(borderGeo, mats.concrete);
        border.position.y = 0.25;
        roofItems.add(border);

        // Caixas de ar condicionado
        const acGeo = new THREE.BoxGeometry(1.5, 1.2, 1.5);
        for(let i=0; i<Math.floor((w*d)/20); i++) {
            const ac = new THREE.Mesh(acGeo, mats.concrete);
            ac.position.set((Math.random()-0.5)*(w-3), 0.6, (Math.random()-0.5)*(d-3));
            ac.castShadow = true;
            roofItems.add(ac);
        }
        group.add(roofItems);

        return group;
    }

    function createDetailedTree() {
        const group = new THREE.Group();
        // Tronco
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.5, 5), new THREE.MeshStandardMaterial({color: 0x3d2817}));
        trunk.position.y = 0.75; trunk.castShadow = true; group.add(trunk);
        // Folhas (Agrupamento de esferas achatadas para estilo maquete)
        const leafMat = new THREE.MeshStandardMaterial({color: 0x225522, roughness: 0.9});
        const cl1 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 7, 7), leafMat);
        cl1.position.set(0, 2, 0); cl1.castShadow = true; group.add(cl1);
        const cl2 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 7), leafMat);
        cl2.position.set(0.5, 2.5, -0.5); cl2.castShadow = true; group.add(cl2);
        const cl3 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 7, 7), leafMat);
        cl3.position.set(-0.5, 2.2, 0.5); cl3.castShadow = true; group.add(cl3);
        
        group.scale.setScalar(0.7 + Math.random()*0.6);
        return group;
    }

    function buildStreetLights(gridBlocks, startOffset, totalSpacing) {
        const poleMat = new THREE.MeshStandardMaterial({color: 0x444444, metalness: 0.8});
        const lampMat = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xffddaa, emissiveIntensity: 0});
        
        for (let i = 0; i <= gridBlocks; i++) {
            for (let j = 0; j < gridBlocks; j++) {
                const z = startOffset + j * totalSpacing;
                const x = startOffset + i * totalSpacing - totalSpacing/2;
                
                // Poste na calçada
                const g = new THREE.Group();
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6, 6), poleMat);
                pole.position.y = 3; g.add(pole);
                const arm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), poleMat);
                arm.position.set(1.2, 5.8, 0); g.add(arm);
                
                const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.4), lampMat.clone());
                lamp.position.set(2, 5.75, 0); g.add(lamp);
                
                // Luz real
                const light = new THREE.PointLight(0xffddaa, 0, 20);
                light.position.set(2, 5.5, 0);
                g.add(light);
                
                g.position.set(x, 0, z + BS/2 - 2);
                scene.add(g);
                streetLights.push({ lampMat: lamp.material, light: light });
            }
        }
    }

    // ============================================================
    // TRÁFEGO E VEÍCULOS (Realistas)
    // ============================================================
    function createCarMesh(colorHex) {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({color: colorHex, roughness: 0.2, metalness: 0.6, envMap: envMap, envMapIntensity: 1.0});
        
        // Carroceria principal
        const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 4), bodyMat);
        body.position.y = 0.5; body.castShadow = true; group.add(body);
        
        // Cabine (Vidros escuros)
        const cabinMat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.1, metalness: 0.9, envMap: envMap});
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.2), cabinMat);
        cabin.position.set(0, 1.05, -0.2); cabin.castShadow = true; group.add(cabin);
        
        // Rodas
        const wheelMat = new THREE.MeshStandardMaterial({color: 0x222222, roughness: 0.9});
        const wGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
        wGeo.rotateZ(Math.PI/2);
        const wx = 1.0, wz = 1.2, wy = 0.3;
        [[-wx, wy, wz], [wx, wy, wz], [-wx, wy, -wz], [wx, wy, -wz]].forEach(pos => {
            const w = new THREE.Mesh(wGeo, wheelMat);
            w.position.set(...pos); group.add(w);
        });

        // Faróis Dianteiros (Brancos)
        const hlMat = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1});
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), hlMat);
        hlL.position.set(-0.7, 0.5, -2.05); group.add(hlL);
        const hlR = hlL.clone(); hlR.position.set(0.7, 0.5, -2.05); group.add(hlR);
        
        // Lanternas Traseiras (Vermelhas)
        const tlMat = new THREE.MeshStandardMaterial({color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1});
        const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), tlMat);
        tlL.position.set(-0.6, 0.6, 2.05); group.add(tlL);
        const tlR = tlL.clone(); tlR.position.set(0.6, 0.6, 2.05); group.add(tlR);

        group.userData.lights = [hlMat, tlMat]; // Para acender/apagar de noite
        return group;
    }

    function spawnCars() {
        const colors = [0xdddddd, 0x111111, 0x990000, 0x0033aa, 0x777777, 0xbbbb22];
        const lanes = [-2, 2]; // Posição nas vias (+x e -x)
        
        // Vias horizontais e verticais
        for (let i = -2; i <= 2; i++) {
            const roadPos = i * (BS + RW);
            // Spawn na horizontal
            for(let j=0; j<4; j++) {
                const c = createCarMesh(colors[Math.floor(Math.random()*colors.length)]);
                const lane = lanes[Math.floor(Math.random()*lanes.length)];
                c.position.set((Math.random()-0.5)*CS, 0, roadPos + lane);
                c.rotation.y = lane > 0 ? -Math.PI/2 : Math.PI/2;
                c.userData.speed = 20 + Math.random()*15;
                c.userData.axis = 'x';
                c.userData.dir = lane > 0 ? -1 : 1;
                c.userData.limit = CS/2;
                scene.add(c); cars.push(c);
            }
            // Spawn na vertical
            for(let j=0; j<4; j++) {
                const c = createCarMesh(colors[Math.floor(Math.random()*colors.length)]);
                const lane = lanes[Math.floor(Math.random()*lanes.length)];
                c.position.set(roadPos + lane, 0, (Math.random()-0.5)*CS);
                c.rotation.y = lane > 0 ? 0 : Math.PI;
                c.userData.speed = 20 + Math.random()*15;
                c.userData.axis = 'z';
                c.userData.dir = lane > 0 ? -1 : 1;
                c.userData.limit = CS/2;
                scene.add(c); cars.push(c);
            }
        }
    }

    // ============================================================
    // LOOP PRINCIPAL (Animação)
    // ============================================================
    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta() * timeSpeed;
        
        controls.update();

        // 1. Atualizar Tempo e Iluminação
        cityTime += delta * 0.2; // Velocidade do dia
        if (cityTime >= 24) cityTime -= 24;
        
        updateEnvironment(cityTime);
        updateUI();

        // 2. Mover Carros
        cars.forEach(c => {
            const move = c.userData.speed * delta * c.userData.dir;
            if (c.userData.axis === 'x') {
                c.position.x += move;
                if(c.position.x > c.userData.limit) c.position.x = -c.userData.limit;
                if(c.position.x < -c.userData.limit) c.position.x = c.userData.limit;
            } else {
                c.position.z += move;
                if(c.position.z > c.userData.limit) c.position.z = -c.userData.limit;
                if(c.position.z < -c.userData.limit) c.position.z = c.userData.limit;
            }
        });

        renderer.render(scene, camera);
    }

    function updateEnvironment(time) {
        // Cálculo do Sol
        const angle = ((time - 6) / 12) * Math.PI; // 6h = 0, 18h = PI
        const isDay = time > 5.5 && time < 18.5;
        
        if (isDay) {
            sunLight.intensity = Math.sin(angle) * 2.5;
            sunLight.position.set(Math.cos(angle)*150, Math.sin(angle)*150, 50);
            
            // Cores do amanhecer/entardecer
            if (time < 8 || time > 16) {
                sunLight.color.setHex(0xffaa66);
                scene.background.setHex(0xffaa66);
                scene.fog.color.setHex(0xffaa66);
            } else {
                sunLight.color.setHex(0xfff5e6);
                scene.background.setHex(0x88ccff);
                scene.fog.color.setHex(0x88ccff);
            }
        } else {
            sunLight.intensity = 0;
            scene.background.setHex(0x050811);
            scene.fog.color.setHex(0x050811);
        }

        // Liga/Desliga luzes urbanas e janelas
        const lightsOn = time < 7 || time > 17.5;
        
        streetLights.forEach(sl => {
            const targetIntensity = lightsOn ? 1.0 : 0.0;
            sl.lampMat.emissiveIntensity = targetIntensity;
            sl.light.intensity = lightsOn ? 0.8 : 0.0;
        });

        // Faróis dos carros
        cars.forEach(c => {
            c.userData.lights[0].emissiveIntensity = lightsOn ? 2.0 : 0.2;
            c.userData.lights[1].emissiveIntensity = lightsOn ? 1.5 : 0.2;
        });

        // Emissividade das janelas dos prédios
        windowMaterials.forEach(mat => {
            // O próprio material precisa ter emissive, mas como estamos usando map...
            // O truque simples é deixar a cena escura e o material reage ao Ambient/Hemisphere.
            // Para o vidro realmente "brilhar", aumentamos levemente a cor emissiva global do material à noite
            if(lightsOn) {
                mat.emissive.setHex(0x222211);
            } else {
                mat.emissive.setHex(0x000000);
            }
        });
        
        // Ajuste da HemiLight para noite
        hemiLight.intensity = lightsOn ? 0.05 : 0.4;
    }

    function updateUI() {
        const h = Math.floor(cityTime);
        const m = Math.floor((cityTime % 1) * 60);
        document.getElementById('clock').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        
        // Oscilações leves para o painel não ficar estático
        if(Math.random() > 0.9) {
            const r = Math.random();
            document.getElementById('valSpeed').textContent = (35 + r * 10).toFixed(0) + ' km/h';
            document.getElementById('valEnergy').textContent = (30 + r * 20).toFixed(1) + ' MW';
        }
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    // Inicia a aplicação após todas as funções e variáveis estarem declaradas
    init();
    