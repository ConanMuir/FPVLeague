// Cosmetics (Rocket League style): looks only. Nothing here reaches computeLoadout, the flight model or the colliders.
// Plain data: six categories of items with a name, a rarity and the look values the renderer reads (render/cos-mat.js).
// A drone's cosmetics are six ids, one per category ({paint, decal, props, bell, led, trail}); saves and the network carry
// them as an array in COS_CATS order and cleanCos() checks every id against these lists (untrusted input).
// Colours: hex numbers; null = the drone's team colour. Team colour stays readable: the team-anodised parts (standoffs,
// motor bands, canopies, armour, straps), the FPV marker and every decal are always team-coloured, and any cosmetic colour too
// close to the rival team's hue is turned to your own team's hue (teamSafe), like RL keeping orange shades off the blue team.
export const RARITY={common:['Common','#c8ccd4'],uncommon:['Uncommon','#9fd8a8'],rare:['Rare','#6f9bff'],vrare:['Very Rare','#a77bff'],import:['Import','#ff5c55'],exotic:['Exotic','#f2d055'],bm:['Black Market','#ff3fae']};
// paint: the frame and body finish (everything that is carbon on the stock quad). weave: 0 none, 1 twill, 2 forged
export const PAINTS=[
 {id:'carbon',name:'Carbon',sub:'Bare 3K twill, the stock frame',r:'common',col:0x16191f,rough:.45,metal:.7,weave:1},
 {id:'gcarbon',name:'Gloss Carbon',sub:'Twill under a deep clear coat',r:'uncommon',col:0x16191f,rough:.3,metal:.6,weave:1,coat:1},
 {id:'forged',name:'Forged Carbon',sub:'Chopped-strand marble',r:'vrare',col:0x1c1f25,rough:.35,metal:.6,weave:2,coat:.6},
 {id:'kevlar',name:'Aramid',sub:'Gold aramid weave',r:'rare',col:0x9a7c1a,rough:.4,metal:.35,weave:1,coat:.5},
 {id:'cobalt',name:'Cobalt Weave',sub:'Blue-tinted carbon',r:'rare',col:0x1b2d5c,rough:.38,metal:.6,weave:1,coat:.5},
 {id:'crimson',name:'Crimson Weave',sub:'Red-tinted carbon',r:'rare',col:0x4d1218,rough:.38,metal:.6,weave:1,coat:.5},
 {id:'venom',name:'Venom Weave',sub:'Green-tinted carbon',r:'rare',col:0x163d22,rough:.38,metal:.6,weave:1,coat:.5},
 {id:'matte',name:'Matte Black',sub:'Flat, no shine',r:'common',col:0x121316,rough:.92,metal:0},
 {id:'primer',name:'Primer',sub:'Grey shop primer',r:'common',col:0x6e737b,rough:.85,metal:0},
 {id:'white',name:'Gloss White',sub:'Clean white clear coat',r:'uncommon',col:0xe6eaf0,rough:.3,metal:0,coat:1},
 {id:'gunmetal',name:'Gunmetal',sub:'Dark brushed metallic',r:'uncommon',col:0x3b4049,rough:.32,metal:.9},
 {id:'candy',name:'Candy Red',sub:'Metallic red, clear coat',r:'vrare',col:0x9a0c18,rough:.28,metal:.6,coat:1},
 {id:'midnight',name:'Midnight Purple',sub:'Metallic violet',r:'vrare',col:0x2c1458,rough:.3,metal:.7,coat:1},
 {id:'teammet',name:'Team Metallic',sub:'Your team colour, metal flake',r:'import',col:null,rough:.3,metal:.7,coat:1,dim:.55},
 {id:'chrome',name:'Chrome',sub:'Mirror finish',r:'exotic',col:0xf0f3f8,rough:.16,metal:1},
 {id:'gold',name:'24K',sub:'Polished gold',r:'bm',col:0xe0bd55,rough:.14,metal:1},
 {id:'pearl',name:'Pearlescent',sub:'White pearl with a colour shift',r:'bm',col:0xdfe3ea,rough:.22,metal:.2,coat:1,irid:1}];
// decals: procedural patterns drawn in the paint shader (object space, so they need no UVs); always in the team colour.
// pat: the shader pattern number; num: race number digits; box: confined to the chassis and also on the battery wrap; pack: only on the battery
export const DECALS=[
 {id:'none',name:'None',sub:'Clean frame',r:'common',pat:0},
 {id:'stripes',name:'Racing Stripes',sub:'Twin stripes nose to tail',r:'common',pat:1,box:1},
 {id:'center',name:'Center Line',sub:'One wide stripe with pinstripes',r:'uncommon',pat:2,box:1},
 {id:'chevron',name:'Chevrons',sub:'Arrows pointing forward',r:'rare',pat:3,box:1},
 {id:'flames',name:'Hot Rod',sub:'Flames off the nose',r:'vrare',pat:4,box:1},
 {id:'hex',name:'Hexcore',sub:'Hex grid over the whole frame',r:'rare',pat:5},
 {id:'tiger',name:'Tiger',sub:'Organic stripes everywhere',r:'vrare',pat:6},
 {id:'camo',name:'Splotch Camo',sub:'Two-tone blotches',r:'uncommon',pat:7},
 {id:'check',name:'Chequered',sub:'Flag squares on the battery',r:'import',pat:8,box:1,pack:1},
 {id:'n07',name:'Race No. 07',sub:'Big number on the battery',r:'rare',pat:9,num:7,box:1,pack:1},
 {id:'n23',name:'Race No. 23',sub:'Big number on the battery',r:'rare',pat:9,num:23,box:1,pack:1},
 {id:'n88',name:'Race No. 88',sub:'Big number on the battery',r:'import',pat:9,num:88,box:1,pack:1},
 {id:'split',name:'Two-Tone',sub:'Team-coloured front half',r:'uncommon',pat:10,box:1}];
// props: blade colour and how see-through they are (col null = team tint)
export const PROPS=[
 {id:'team',name:'Team Tint',sub:'Translucent team colour',r:'common',col:null,op:.55},
 {id:'smoke',name:'Smoke',sub:'Dark translucent',r:'common',col:0x23272d,op:.7},
 {id:'clear',name:'Clear',sub:'Nearly invisible',r:'uncommon',col:0xdfe8f0,op:.28},
 {id:'black',name:'Solid Black',sub:'Opaque',r:'common',col:0x101114,op:1},
 {id:'white',name:'Solid White',sub:'Opaque',r:'uncommon',col:0xeef1f6,op:1},
 {id:'yellow',name:'Neon Yellow',sub:'Translucent',r:'rare',col:0xe6ff38,op:.65},
 {id:'pink',name:'Hot Pink',sub:'Translucent',r:'rare',col:0xff3fa8,op:.65},
 {id:'lime',name:'Lime',sub:'Translucent',r:'rare',col:0x6bff4a,op:.6},
 {id:'violet',name:'Violet',sub:'Translucent',r:'vrare',col:0x9a4dff,op:.62},
 {id:'ice',name:'Ice',sub:'Pale see-through blue',r:'vrare',col:0x8fdcff,op:.45},
 {id:'amber',name:'Amber',sub:'Translucent orange',r:'vrare',col:0xff9a1a,op:.6},
 {id:'glow',name:'Glow',sub:'Lit team-coloured blades',r:'exotic',col:null,op:.8,emis:1}];
// motor bells: anodised colours (null col on stock = the power unit's own bell; team = your team colour)
export const BELLS=[
 {id:'stock',name:'Stock',sub:'The motor\'s own finish',r:'common',stock:1},
 {id:'team',name:'Team Anodised',sub:'Your team colour',r:'uncommon',col:null},
 {id:'red',name:'Anodised Red',sub:'',r:'common',col:0xc0182a},
 {id:'purple',name:'Anodised Purple',sub:'',r:'uncommon',col:0x7a3cff},
 {id:'green',name:'Anodised Green',sub:'',r:'uncommon',col:0x1fb85a},
 {id:'cyan',name:'Anodised Cyan',sub:'',r:'rare',col:0x18b8d0},
 {id:'gold',name:'Anodised Gold',sub:'',r:'rare',col:0xd8b04a},
 {id:'black',name:'Black Oxide',sub:'',r:'common',col:0x1a1b1f,rough:.45},
 {id:'ti',name:'Titanium',sub:'Bare polished titanium',r:'vrare',col:0xb8bcc4,rough:.22},
 {id:'oil',name:'Oil Slick',sub:'Burnt rainbow titanium',r:'bm',col:0x3a3550,rough:.2,irid:1}];
// antenna tip and LEDs (null = team colour)
export const LEDS=[
 {id:'team',name:'Team',sub:'Your team colour',r:'common',col:null},
 {id:'white',name:'White',sub:'',r:'common',col:0xffffff},
 {id:'red',name:'Red',sub:'',r:'common',col:0xff2236},
 {id:'green',name:'Green',sub:'',r:'uncommon',col:0x3dff6a},
 {id:'cyan',name:'Cyan',sub:'',r:'uncommon',col:0x3cf0ff},
 {id:'pink',name:'Pink',sub:'',r:'rare',col:0xff3cc4},
 {id:'purple',name:'Purple',sub:'',r:'rare',col:0xa04dff},
 {id:'yellow',name:'Yellow',sub:'',r:'rare',col:0xfff03a},
 {id:'amber',name:'Amber',sub:'',r:'vrare',col:0xffa020}];
// trails: boost / speed trail colour (col, fading to col2) and a style hint for the boost effect (render reads drone.trailCol/trailCol2/trailStyle)
export const TRAILS=[
 {id:'team',name:'Team Stream',sub:'Your team colour',r:'common',col:null,col2:null,style:'stream'},
 {id:'white',name:'White Streak',sub:'Clean and bright',r:'common',col:0xf2f6ff,col2:0x9fb4d8,style:'stream'},
 {id:'fire',name:'Afterburner',sub:'Flame trail',r:'vrare',col:0xffd040,col2:0xff4a10,style:'fire'},
 {id:'plasma',name:'Plasma',sub:'Violet energy',r:'vrare',col:0xd070ff,col2:0x6a2cff,style:'plasma'},
 {id:'toxic',name:'Toxic',sub:'Acid green sparks',r:'rare',col:0x9dff40,col2:0x1fbf5a,style:'sparks'},
 {id:'gold',name:'Gold Dust',sub:'Glittering gold',r:'import',col:0xffe07a,col2:0xd8a030,style:'sparkle'},
 {id:'ghost',name:'Ghost',sub:'Pale smoke',r:'uncommon',col:0xdde6ff,col2:0x5a6a88,style:'smoke'},
 {id:'rainbow',name:'Prism',sub:'Full spectrum',r:'bm',col:0xff4040,col2:0x4060ff,style:'rainbow'}];

export const COS_CATS=['paint','decal','props','bell','led','trail'],COS_NAMES=['Paint','Decal','Props','Bells','LEDs','Trail'],COS={paint:PAINTS,decal:DECALS,props:PROPS,bell:BELLS,led:LEDS,trail:TRAILS};
export const COS_DEF=Object.freeze({paint:'carbon',decal:'none',props:'team',bell:'stock',led:'team',trail:'team'});
export const cosItem=(cat,id)=>COS[cat]?.find(x=>x.id===id)||COS[cat]?.[0];
// untrusted input (saves, the network): an object or an array in COS_CATS order -> a clean {paint..trail}; unknown ids get the default
export function cleanCos(x){const o={};const arr=Array.isArray(x);if(!x||typeof x!=='object'||arr&&x.length>12)return {...COS_DEF};
 COS_CATS.forEach((c,i)=>{const id=arr?x[i]:x[c];o[c]=typeof id==='string'&&id.length<16&&COS[c].some(it=>it.id===id)?id:COS_DEF[c]});return o}
export const cosIds=c=>COS_CATS.map(k=>c[k]);  // network form: a short array of ids
// bots: random cosmetics seeded per slot key (stable for a match); about one bot in four stays stock-looking
export function seededCos(key,seed=0){let h=(2654435761^seed)>>>0;for(const ch of String(key))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
 const rnd=()=>{h=h+0x6D2B79F5>>>0;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
 if(rnd()<.25)return {...COS_DEF};const o={};for(const c of COS_CATS){const l=COS[c];o[c]=rnd()<.3?COS_DEF[c]:l[Math.floor(rnd()*l.length)].id}return o}

// ---------- team-aware colour rule ----------
const TEAMHEX=[0x2d8cff,0xff7a1a];  // = COL in config/constants.js (kept here so this file stays plain data with no imports)
function hsl(hex){const r=(hex>>16&255)/255,g=(hex>>8&255)/255,b=(hex&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
 if(!d)return [0,0,l];const s=d/(1-Math.abs(2*l-1));let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return [(h*60+360)%360,s,l]}
function fromHsl(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,[r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return (Math.round((r+m)*255)<<16)|(Math.round((g+m)*255)<<8)|Math.round((b+m)*255)}
export const RIVAL_HUE=18;  // degrees: a saturated colour this close to the other team's hue reads as the other team
// the colour as shown on team t: null -> team colour; too close to the rival's hue -> moved to your own team's hue (same saturation/lightness)
export function teamSafe(hex,t){if(hex==null)return TEAMHEX[t];const[h,s,l]=hsl(hex),rh=hsl(TEAMHEX[1-t])[0],d=Math.abs(((h-rh)%360+540)%360-180);
 return s>.4&&l>.12&&l<.92&&d<RIVAL_HUE?fromHsl(hsl(TEAMHEX[t])[0],s,l):hex}
export const shifted=(hex,t)=>hex!=null&&teamSafe(hex,t)!==hex;
