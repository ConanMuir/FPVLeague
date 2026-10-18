// Calibration Lab room: a lit box at the arena centre (floor = the arena floor, so collision stays trivial), with a grid
// for optical flow, glowing edges, and the drill markers (height band, tracking target, projectiles). Built on first use.
import * as THREE from 'three';
import {glow,scene,tex} from '../render/renderer.js';
import {ROOM} from './drills.js';
export const labG=new THREE.Group();labG.visible=false;scene.add(labG);
export const LM={band:null,tgt:null,proj:[],lines:[],pad:null};
let built=false;
export function buildRoom(){if(built)return;built=true;const{hx,hz,h}=ROOM;
 const grid=(rx,ry,bg,ln)=>{const t=tex(256,256,(g,w,hh)=>{g.fillStyle=bg;g.fillRect(0,0,w,hh);g.strokeStyle=ln;g.lineWidth=3;g.strokeRect(0,0,w,hh);g.lineWidth=1;g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,hh);g.moveTo(0,hh/2);g.lineTo(w,hh/2);g.stroke()},true);t.repeat.set(rx,ry);return t};
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(hx*2,hz*2).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:grid(hx/2,hz/2,'#1b2333','#5f7bb0'),roughness:.85,metalness:.05}));
 floor.position.y=.02;floor.receiveShadow=true;
 const wt=grid(hx/2,h/4,'#202a3c','#7090c8');  // self-lit a little so the ceiling and shaded walls still read (no extra lights: they would recompile every material)
 const walls=new THREE.Mesh(new THREE.BoxGeometry(hx*2,h,hz*2),new THREE.MeshStandardMaterial({map:wt,emissive:0xffffff,emissiveMap:wt,emissiveIntensity:.45,side:THREE.BackSide,roughness:.9}));walls.position.y=h/2;
 labG.add(floor,walls);
 // glowing edges and a take-off pad
 const eg=new THREE.EdgesGeometry(new THREE.BoxGeometry(hx*2-.1,h-.1,hz*2-.1));const edges=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:new THREE.Color(0x56c8ff).multiplyScalar(1.4),toneMapped:false}));edges.position.y=h/2;labG.add(edges);
 const lm=new THREE.LineBasicMaterial({color:0x6d86b8});for(const y of[4,8,12,16]){const a=hx-.05,b=hz-.05;labG.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[a,b],[-a,b],[-a,-b],[a,-b]].map(([x,z])=>new THREE.Vector3(x,y,z))),lm))}  // height marks on the walls
 LM.pad=new THREE.Mesh(new THREE.RingGeometry(1.1,1.35,48).rotateX(-Math.PI/2),glow(0xffc640,1.2));LM.pad.position.y=.04;labG.add(LM.pad);
 // height band: a translucent slab across the room, seen as a green stripe on the walls
 LM.band=new THREE.Mesh(new THREE.BoxGeometry(hx*2-.3,1,hz*2-.3),new THREE.MeshBasicMaterial({color:0x3dff9a,transparent:true,opacity:.16,side:THREE.BackSide,depthWrite:false}));LM.band.visible=false;labG.add(LM.band);
 // tracking target: ring + roll bar
 LM.tgt=new THREE.Group();LM.tgt.add(new THREE.Mesh(new THREE.TorusGeometry(.9,.07,8,40),glow(0x3dff9a,1.6)),new THREE.Mesh(new THREE.BoxGeometry(2.8,.09,.09),glow(0x3dff9a,1.6)));LM.tgt.visible=false;labG.add(LM.tgt);
 // projectiles + warning lines
 const pg=new THREE.SphereGeometry(.6,20,12),pm=glow(0xff4a3a,2);
 for(let i=0;i<4;i++){const m=new THREE.Mesh(pg,pm);m.visible=false;labG.add(m);LM.proj.push(m);
  const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:new THREE.Color(0xff4a3a).multiplyScalar(1.5),transparent:true,opacity:.8,toneMapped:false}));
  l.visible=false;l.frustumCulled=false;labG.add(l);LM.lines.push(l)}}
