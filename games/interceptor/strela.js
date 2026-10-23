/* The interceptor's body styled as the shoulder-fired Strela-2 missile seen in Ukraine footage (appearance only): a long slim plain tube in dull
 olive, a small bluish glass seeker dome on a short tapered nose, four small canards just behind it, four thin narrow tail fins and a plain
 nozzle, with a couple of thin painted bands and faint stencils from a small canvas texture. Also the matching launch tube (strelaLauncher).
 All geometry and textures are built in code and merged into one mesh per material (shared by every body). It covers the same envelope as
 Riley's dart (nose tip y ~0.38, fin tips at r 0.15 / y -0.36), so the collision hull, camera and props stay where they are; the quad arms,
 motors and props are shared and added by interceptor.js. Body +Y = nose. The nozzle exit sits at (0, -0.375, 0); the exhaust points along local -Y. */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {tex} from '../../engine/render.js';

const R=.03,Y0=-.33,Y1=.3,H=Y1-Y0,PAINT='#3d4430';  /* main tube radius and extent (the textured part), base paint */
/* tube skin: canvas top = nose end (CylinderGeometry puts uv.y=1 at the top), canvas x = around the body starting at +Z */
const skin=()=>tex(256,1024,(g,w,h)=>{const row=y=>(Y1-y)/H*h;
 g.fillStyle=PAINT;g.fillRect(0,0,w,h);
 for(let i=0;i<500;i++){g.fillStyle=`rgba(${Math.random()<.5?'18,20,12':'120,128,96'},${.025+Math.random()*.04})`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,6+Math.random()*50)}  /* faint brush streaks */
 for(let i=0;i<40;i++){g.fillStyle=`rgba(160,158,135,${.06+Math.random()*.1})`;g.beginPath();g.ellipse(Math.random()*w,Math.random()*h,1+Math.random()*3,1+Math.random()*1.5,Math.random()*3,0,7);g.fill()}  /* small chips */
 const band=(y0,y1,c)=>{g.fillStyle=c;g.fillRect(0,row(y1),w,Math.max(2,row(y0)-row(y1)))};
 for(const y of[.238,.118,-.04,-.205])band(y-.0012,y+.0012,'rgba(14,16,12,.85)');  /* section joints */
 band(.168,.178,'rgba(150,128,52,.8)');band(-.33,-.322,'#202219');  /* one thin dull yellow band, the dark tail ring */
 g.fillStyle='rgba(205,202,182,.5)';g.textAlign='center';g.textBaseline='middle';
 for(const u of[.25,.75]){g.save();g.translate(u*w,row(-.11));g.rotate(-Math.PI/2);g.font='bold 24px "Arial Narrow",Arial,sans-serif';g.fillText('9М32М',0,0);
  g.font='12px Arial,sans-serif';g.fillText('№ 0412  08-84',0,20);g.restore();
  g.save();g.translate(u*w,row(.05));g.rotate(-Math.PI/2);g.font='11px Arial,sans-serif';g.fillText('ОСТОРОЖНО',0,0);g.restore();
  g.fillRect(u*w-9,row(.208),18,2)}  /* stencils on two sides; a short arming tick */
 g.fillStyle='rgba(20,22,16,.4)';for(const u of[0,.5])g.fillRect(u*w,0,2,h)});  /* seam lines */

let M=null;
const mats=()=>M||(M={skin:new THREE.MeshStandardMaterial({map:skin(),roughness:.74,metalness:.08}),
 olive:new THREE.MeshStandardMaterial({color:0x353b29,roughness:.74,metalness:.08}),dark:new THREE.MeshStandardMaterial({color:0x1a1c18,roughness:.6,metalness:.3}),
 steel:new THREE.MeshStandardMaterial({color:0x2f3133,roughness:.4,metalness:.8,side:THREE.DoubleSide}),soot:new THREE.MeshBasicMaterial({color:0x050505}),
 glass:new THREE.MeshStandardMaterial({color:0x6d8ca8,roughness:.06,metalness:.55,transparent:true,opacity:.86,depthWrite:false})});

/* thin fin outline in the (radial, y) plane, extruded and centred on the plane; geometry helpers place a part and drop its index so all merge */
const fin=(pts,t)=>{const s=new THREE.Shape();s.moveTo(...pts[0]);for(const p of pts.slice(1))s.lineTo(...p);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:false}).translate(0,0,-t/2)};
const at=(geo,y,ry=0)=>{geo.rotateY(ry).translate(0,y,0);return geo.index?geo.toNonIndexed():geo};
const merge=a=>{for(const g of a){g.clearGroups();g.deleteAttribute('uv')}return mergeGeometries(a)};
const four=(mk,y=0)=>[0,1,2,3].map(k=>at(mk(),y,k*Math.PI/2));

let GE=null;
const geos=()=>GE||(GE={
 tube:new THREE.CylinderGeometry(R,R,H,24,1,true).translate(0,(Y0+Y1)/2,0),
 olive:merge([at(new THREE.LatheGeometry([0,.25,.5,.75,1].map(t=>new THREE.Vector2(.0195+(R-.0195)*(1-t**1.7),Y1+.052*t)),24),0),  /* short tapered nose */
  ...four(()=>fin([[R-.002,.246],[R-.002,.284],[.052,.276],[.052,.258]],.0025)),  /* small canards just behind the nose */
  ...four(()=>fin([[R-.002,-.27],[R-.002,-.314],[.15,-.36],[.15,-.318]],.003))]),  /* four thin narrow swept tail fins (it stands on the tips) */
 dark:merge([at(new THREE.CylinderGeometry(R+.004,R+.004,.03,24),.1),  /* clamp where the quad arms cross the body */
  at(new THREE.CylinderGeometry(R,R*.9,.006,24),Y0-.003),at(new THREE.SphereGeometry(.008,10,6),.36)]),  /* tail ring; the seeker eye behind the glass */
 steel:merge([at(new THREE.CylinderGeometry(.0205,.0205,.004,24),.353),at(new THREE.CylinderGeometry(.0165,.0185,.039,18,1,true),-.3555)]),  /* dome retaining ring, plain nozzle */
 soot:new THREE.CircleGeometry(.0165,18).rotateX(Math.PI/2).translate(0,-.346,0),
 glass:new THREE.SphereGeometry(.0195,20,10,0,Math.PI*2,0,Math.PI/2).scale(1,1.25,1).translate(0,.354,0)});  /* rounded seeker dome */

export function strelaBody(){const g=new THREE.Group(),m=mats(),G=geos();
 for(const k of['tube','olive','dark','steel','soot','glass']){const o=new THREE.Mesh(G[k],m[k==='tube'?'skin':k]);o.castShadow=k!=='soot'&&k!=='glass';g.add(o)}
 return g}

/* the matching launch tube (one merged geometry, a new one each call: zdef.js frees a defence's geometries with it), along local Z with the
 muzzle at +Z, length L and radius r: end caps, a pistol grip with its trigger guard, the cylindrical battery unit under the front, a simple
 sight on the left of the front and a shoulder rest */
export function strelaLauncher(L=1.5,r=.05){const p=(geo,x,y,z,rx=0)=>{geo.rotateX(rx).translate(x,y,z);return geo},Z=L/2;
 return mergeGeometries([p(new THREE.CylinderGeometry(r,r,L,10,1,true),0,0,0,Math.PI/2),
  p(new THREE.CylinderGeometry(r*1.25,r*1.25,L*.06,10),0,0,Z-L*.03,Math.PI/2),p(new THREE.CylinderGeometry(r*1.25,r*1.25,L*.06,10),0,0,-Z+L*.03,Math.PI/2),
  p(new THREE.BoxGeometry(r*.7,r*2.6,r*1.1),0,-r*2,Z*.2,.25),p(new THREE.BoxGeometry(r*.3,r*.3,r*1.6),0,-r*1.3,Z*.2+r*1.1),
  p(new THREE.CylinderGeometry(r*.7,r*.7,r*3.2,8),0,-r*2.3,Z*.58,-.35),
  p(new THREE.BoxGeometry(r*.35,r*1.4,r*.35),-r*1.15,r*.9,Z*.62),p(new THREE.BoxGeometry(r*.35,r*.35,r*1.6),-r*1.15,r*1.5,Z*.62),
  p(new THREE.BoxGeometry(r*.6,r*1.6,r*2.2),0,-r*1.3,-Z*.45)].map(g=>g.index?g.toNonIndexed():g).map(g=>{g.deleteAttribute('uv');return g}))}
