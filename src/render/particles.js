// ---------- particles ----------
import * as THREE from 'three';
import {scene,tex} from './renderer.js';
const PN=1600,pPos=new Float32Array(PN*3).fill(-999),pCol=new Float32Array(PN*3),pBase=new Float32Array(PN*3),pVel=new Float32Array(PN*3),pLife=new Float32Array(PN);let pi=0;
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
export const dot=tex(64,64,(g)=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'#fff');r.addColorStop(.4,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64)});
const parts=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.9,map:dot,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));parts.frustumCulled=false;scene.add(parts);
const _c=new THREE.Color();
export function emit(p,hex,n,spd,life=1,bv=null,k=2){_c.set(hex).multiplyScalar(k);for(let j=0;j<n;j++){const i=pi++%PN,i3=i*3;
 let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;const m=spd*(.3+Math.random()*.7)/(Math.hypot(x,y,z)||1);
 pPos[i3]=p.x;pPos[i3+1]=p.y;pPos[i3+2]=p.z;pVel[i3]=x*m+(bv?bv.x:0);pVel[i3+1]=y*m+(bv?bv.y:0);pVel[i3+2]=z*m+(bv?bv.z:0);
 pBase[i3]=_c.r;pBase[i3+1]=_c.g;pBase[i3+2]=_c.b;pLife[i]=life*(.5+Math.random()*.5)}}
export function updParts(dt){const dmp=Math.exp(-dt*1.8);for(let i=0;i<PN;i++){const i3=i*3;if(pLife[i]<=0)continue;pLife[i]-=dt;
 if(pLife[i]<=0){pPos[i3+1]=-999;pCol[i3]=pCol[i3+1]=pCol[i3+2]=0;continue}
 pVel[i3]*=dmp;pVel[i3+1]=pVel[i3+1]*dmp-3*dt;pVel[i3+2]*=dmp;pPos[i3]+=pVel[i3]*dt;pPos[i3+1]+=pVel[i3+1]*dt;pPos[i3+2]+=pVel[i3+2]*dt;
 const f=Math.min(1,pLife[i]*2);pCol[i3]=pBase[i3]*f;pCol[i3+1]=pBase[i3+1]*f;pCol[i3+2]=pBase[i3+2]*f}
 pGeo.attributes.position.needsUpdate=pGeo.attributes.color.needsUpdate=true}
