// Zombies fog of war (sorties, zsortie.js): what the team knows of the ground. A 72 x 72 grid of 125 m cells over the 9 km map. A cell is
// revealed once a pilot's drone has seen it (sight grows with height) or it lies inside the radar pad's ground-surveillance circle (the
// Long-range radar perk widens it). Revealed cells stay known for the whole run. Drawing is cheap: one 72 x 72 canvas, rebuilt only when a
// cell flips, then drawn scaled with a single drawImage onto the base-screen maps and the radar scope (no 3D fog, nothing per frame).
export function initFog(){
 const N=72,H=4500,C=2*H/N,bits=new Uint8Array(N*N),cv=document.createElement('canvas');cv.width=cv.height=N;
 const g=cv.getContext('2d'),img=g.createImageData(N,N);let dirty=true,ver=0;
 const F={N,C,H,bits,get ver(){return ver}};
 F.cell=(x,z)=>{const i=Math.floor((x+H)/C),j=Math.floor((z+H)/C);return i<0||j<0||i>=N||j>=N?-1:j*N+i};
 F.known=(x,z)=>{const c=F.cell(x,z);return c>=0&&bits[c]===1};
 // reveal every cell whose centre lies within r of (x, z); returns how many flipped
 F.reveal=(x,z,r)=>{let n=0;const i0=Math.max(0,Math.floor((x-r+H)/C)),i1=Math.min(N-1,Math.floor((x+r+H)/C)),j0=Math.max(0,Math.floor((z-r+H)/C)),j1=Math.min(N-1,Math.floor((z+r+H)/C));
  for(let j=j0;j<=j1;j++){const cz=-H+(j+.5)*C-z;for(let i=i0;i<=i1;i++){const k=j*N+i;if(bits[k])continue;const cx=-H+(i+.5)*C-x;if(cx*cx+cz*cz<=r*r){bits[k]=1;n++}}}
  if(n){dirty=true;ver++}return n};
 // share of the cells passing test(x, z) that are revealed (tests, the base screen)
 F.frac=test=>{let a=0,b=0;for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=-H+(i+.5)*C,z=-H+(j+.5)*C;if(!test(x,z))continue;a++;if(bits[j*N+i])b++}return a?b/a:0};
 F.count=()=>bits.reduce((a,b)=>a+b,0);
 F.reset=()=>{bits.fill(0);dirty=true;ver++};
 // the unknown ground as an image: dark where unrevealed, clear where known
 F.canvas=()=>{if(dirty){const d=img.data;for(let k=0;k<N*N;k++){const o=k*4;d[o]=5;d[o+1]=8;d[o+2]=14;d[o+3]=bits[k]?0:255}g.putImageData(img,0,0);dirty=false}return cv};
 // co-op: the host sends the grid packed 8 cells a byte (base64); a client ORs it into its own
 F.pack=()=>{let s='';for(let k=0;k<N*N;k+=8){let b=0;for(let i=0;i<8;i++)if(bits[k+i])b|=1<<i;s+=String.fromCharCode(b)}return btoa(s)};
 F.unpack=s=>{let raw;try{raw=atob(String(s))}catch(e){return 0}let n=0;for(let q=0;q<raw.length&&q*8<N*N;q++){const b=raw.charCodeAt(q);for(let i=0;i<8;i++)if(b>>i&1&&!bits[q*8+i]){bits[q*8+i]=1;n++}}if(n){dirty=true;ver++}return n};
 // an axis-aligned 2D map: mx(x), mz(z) give pixels
 F.drawMap=(g2,mx,mz,a=.82)=>{g2.save();g2.globalAlpha=a;g2.imageSmoothingEnabled=true;g2.drawImage(F.canvas(),mx(-H),mz(-H),mx(H)-mx(-H),mz(H)-mz(-H));g2.restore()};
 // the radar scope: P(x, z) is affine (heading-up rotation + scale), so three points give the canvas transform
 F.drawRadar=(rc,P,a=.5)=>{const o=P(0,0),u=P(1000,0),v=P(0,1000);rc.save();rc.globalAlpha=a;rc.imageSmoothingEnabled=true;
  rc.setTransform((u[0]-o[0])/1000,(u[1]-o[1])/1000,(v[0]-o[0])/1000,(v[1]-o[1])/1000,o[0],o[1]);rc.drawImage(F.canvas(),-H,-H,2*H,2*H);rc.restore()};
 return F}
