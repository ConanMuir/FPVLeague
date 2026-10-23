// The interceptor's body styled as a 9K32 Strela-2 (9M32) missile: slender olive-drab tube at the real 72 mm-class calibre, glass seeker dome
// on a short tapered nose, four small canards behind the dome, four clipped folding tail fins it stands on, joint bands, the yellow warhead band
// and white stencils, and a motor nozzle in the tail. All geometry and textures are built in code. It covers the same envelope as the dart it replaced
// (nose tip y 0.384, fin tips at r 0.15 / y -0.36), so the collision hull, camera and props stay where they are; the quad arms, motors and props
// are shared and added by interceptor.js. Body +Y = nose. The nozzle exit sits at (0, -0.375, 0); the exhaust points along local -Y.
import * as THREE from 'three';
import {tex} from '../../engine/render.js';

const R=.038,Y0=-.31,Y1=.31,H=Y1-Y0;  // main tube radius and extent (the textured part)
// tube skin: canvas top = nose end (CylinderGeometry puts uv.y=1 at the top), canvas x = around the body starting at +Z
const skin=()=>tex(256,1024,(g,w,h)=>{const row=y=>(Y1-y)/H*h;
 g.fillStyle='#56603a';g.fillRect(0,0,w,h);
 for(let i=0;i<900;i++){const x=Math.random()*w,y=Math.random()*h,l=4+Math.random()*40;g.fillStyle=`rgba(${Math.random()<.5?'20,24,10':'150,160,110'},${.04+Math.random()*.06})`;g.fillRect(x,y,1+Math.random()*2,l)}  // paint streaks
 for(let i=0;i<70;i++){g.fillStyle=`rgba(190,185,160,${.08+Math.random()*.15})`;g.beginPath();g.ellipse(Math.random()*w,Math.random()*h,1+Math.random()*4,1+Math.random()*2,Math.random()*3,0,7);g.fill()}  // chips and scuffs
 const band=(y0,y1,c)=>{g.fillStyle=c;g.fillRect(0,row(y1),w,row(y0)-row(y1))};
 band(.262,.27,'#16181a');band(.178,.212,'#c9a227');band(.172,.178,'#16181a');band(.212,.218,'#16181a');  // seeker / steering joint, warhead band with black edges
 band(.04,.046,'#1d2016');band(-.2,-.194,'#1d2016');band(-.31,-.285,'#1a1c17');  // motor section joints, dark tail ring
 g.fillStyle='rgba(225,222,205,.88)';g.font='bold 30px "Arial Narrow",Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';
 for(const u of[.25,.75]){g.font='bold 30px "Arial Narrow",Arial,sans-serif';g.save();g.translate(u*w,row(-.075));g.rotate(-Math.PI/2);g.fillText('9М32',0,0);g.font='bold 15px Arial,sans-serif';g.fillText('07-83  ★  2/4',0,26);g.restore();
  g.font='bold 17px "Arial Narrow",Arial,sans-serif';g.save();g.translate(u*w,row(-.243));g.rotate(-Math.PI/2);g.fillText('ОСТОРОЖНО',0,0);g.restore();
  g.fillStyle='rgba(225,222,205,.88)';g.fillRect(u*w-14,row(.245),28,3);g.fillRect(u*w-14,row(.233),28,3)}  // arming stripes
 g.fillStyle='rgba(30,30,25,.55)';for(const u of[0,.5])g.fillRect(u*w-1,0,3,h)});  // seam lines

let M=null;
const mats=()=>M||(M={skin:new THREE.MeshStandardMaterial({map:skin(),roughness:.62,metalness:.12}),
 olive:new THREE.MeshStandardMaterial({color:0x4f5934,roughness:.6,metalness:.12}),dark:new THREE.MeshStandardMaterial({color:0x1b1d19,roughness:.55,metalness:.3}),
 steel:new THREE.MeshStandardMaterial({color:0x3a3c3e,roughness:.35,metalness:.85,side:THREE.DoubleSide}),soot:new THREE.MeshBasicMaterial({color:0x060606}),
 dome:new THREE.MeshStandardMaterial({color:0x7d8e9a,roughness:.04,metalness:.35,transparent:true,opacity:.5,depthWrite:false}),
 seeker:new THREE.MeshStandardMaterial({color:0xc08a3a,roughness:.25,metalness:1}),ring:new THREE.MeshStandardMaterial({color:0x8a8f93,roughness:.3,metalness:.9})});

// fin outline in the (radial, y) plane, extruded thin and centred on the plane
const fin=(pts,t)=>{const s=new THREE.Shape();s.moveTo(...pts[0]);for(const p of pts.slice(1))s.lineTo(...p);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:false}).translate(0,0,-t/2)};
let GE=null;
const geos=()=>GE||(GE={tube:new THREE.CylinderGeometry(R,R,H,28,1,true),
 tail:new THREE.CylinderGeometry(R,.034,.03,28),nozzle:new THREE.CylinderGeometry(.021,.025,.035,20,1,true),throat:new THREE.CircleGeometry(.021,20).rotateX(Math.PI/2),
 nose:new THREE.CylinderGeometry(.03,R,.045,28,1,true),dome:new THREE.SphereGeometry(.029,24,12,0,Math.PI*2,0,Math.PI/2),
 ringD:new THREE.CylinderGeometry(.0315,.0315,.006,28),seeker:new THREE.CylinderGeometry(.012,.018,.016,16),eye:new THREE.SphereGeometry(.009,12,8),
 collar:new THREE.CylinderGeometry(.042,.042,.032,28),
 canard:fin([[R-.002,.255],[R-.002,.3],[.066,.29],[.066,.272]],.003),  // small trapezoid canards just behind the dome
 tfin:fin([[.034,-.21],[.15,-.295],[.15,-.36],[.034,-.342]],.004)});  // clipped tail fins: swept leading edge, square-cut tip it stands on

export function strelaBody(){const g=new THREE.Group(),m=mats(),G=geos();
 const add=(geo,mat,y,ry=0,shadow=true)=>{const o=new THREE.Mesh(geo,mat);o.position.y=y;o.rotation.y=ry;o.castShadow=shadow;g.add(o);return o};
 add(G.tube,m.skin,0);add(G.tail,m.dark,Y0-.015);add(G.nozzle,m.steel,-.3575);add(G.throat,m.soot,-.345,0,false);
 add(G.nose,m.olive,Y1+.0225);add(G.ringD,m.ring,.356);add(G.seeker,m.seeker,.362,0,false);add(G.eye,m.dark,.37,0,false);add(G.dome,m.dome,.355,0,false);
 add(G.collar,m.dark,.1);  // clamp where the quad arms cross the body
 for(let k=0;k<4;k++){add(G.canard,m.olive,0,k*Math.PI/2);add(G.tfin,m.olive,0,k*Math.PI/2)}
 return g}
