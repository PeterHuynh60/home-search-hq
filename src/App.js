import React, { useState, useMemo, useEffect } from "react";
import { db, auth, extractListingFn, getCommuteFn } from "./firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

var WORK_ADDRESS = "1635 Aurora Ct, Aurora, CO 80045";
var WORK_COORDS = { lat: 39.7392, lng: -104.8374 };
var DEFAULT_CFG = { rate15:4.6, rate30:5.75, term15:15, term30:30, minDown:95000, downPct:20, insPct:0.5, taxPct:0.55 };
var STATUSES = ["Good","Hmm...","Meh","Out","No Thoughts","Waiting"];
var ST_COLORS = { Good:"#28a745","Hmm...":"#ffc107",Meh:"#fd7e14",Out:"#dc3545","No Thoughts":"#6c757d",Waiting:"#17a2b8" };
var K_OPTS = ["Open","Closed","Halfway"];
var S_OPTS = ["House","Townhouse","Condo"];
var P_OPTS = ["None","Reserved (1)","Reserved (2)","Garage (1)","Garage (2)"];
var BED_OPTS = ["1","2","3","4+"];
var BATH_OPTS = ["1","1.5","2","2.5","3+"];
var GMAPS_CLIENT_KEY = "AIzaSyCxX5eVLsbZfPzRlOqKUz5HlS_M8OStBJ8"; // Paste your Google Maps JS API key here
var AUTH_EMAIL = "home@search.hq";

/* ─── Color Palette (matches huynh.place) ─── */
var C = {
  primary: "#55c278",
  primaryDark: "#48a869",
  primaryLight: "#77CE93",
  bg: "#f4f9f6",
  card: "#ffffff",
  cardBorder: "#dee2e6",
  text: "#212529",
  textMuted: "#6c757d",
  textLight: "#888",
  heading: "#55c278",
  inputBg: "#f8f9fa",
  inputBorder: "#ced4da"
};

function calcPmt(ratePct, years, principal) {
  if (!ratePct || !years || principal <= 0) return 0;
  var r = ratePct / 100 / 12;
  var n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcDown(price, cfg) {
  return Math.max(price * (cfg.downPct / 100), cfg.minDown);
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return "—";
  return Math.round(n).toLocaleString();
}

async function doExtractListing(url) {
  try {
    var result = await extractListingFn({ url: url });
    return result.data;
  } catch (e) {
    console.error("Extract fail:", e);
    return null;
  }
}

async function doFetchCommute(addr, city) {
  try {
    var result = await getCommuteFn({ address: addr, city: city });
    return result.data.commute;
  } catch (e) {
    console.error("Commute fail:", e);
    return null;
  }
}

/* ─── Shared Styles ─── */
var ist = {background:C.inputBg,border:"1px solid "+C.inputBorder,borderRadius:6,padding:"6px 8px",color:C.text,fontSize:13,fontFamily:"var(--body)",outline:"none",boxSizing:"border-box",width:"100%"};

function EF(props) {
  return (
    <div style={props.span ? {gridColumn:props.span} : {}}>
      <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",display:"block",marginBottom:3}}>{props.label.toUpperCase()}</label>
      <input type={props.type || "text"} value={props.value != null ? props.value : ""} onChange={function(e){props.onChange(e.target.value)}} step={props.type === "number" ? "0.5" : undefined} style={ist} />
    </div>
  );
}

function ES(props) {
  return (
    <div>
      <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",display:"block",marginBottom:3}}>{props.label.toUpperCase()}</label>
      <select value={props.value} onChange={function(e){props.onChange(e.target.value)}} style={Object.assign({},ist,{cursor:"pointer"})}>
        {props.options.map(function(o){ return <option key={o} value={o}>{o}</option> })}
      </select>
    </div>
  );
}

function RatingBar(props) {
  if (props.value == null) return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <span style={{fontSize:11,fontWeight:700,color:props.color+"55",fontFamily:"var(--body)",width:14}}>{props.label}</span>
      <span style={{fontSize:12,color:"#ccc",fontFamily:"var(--body)"}}>—</span>
    </div>
  );
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <span style={{fontSize:11,fontWeight:700,color:props.color,fontFamily:"var(--body)",width:14}}>{props.label}</span>
      <div style={{width:60,height:6,background:"#e9ecef",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:(props.value/10)*60,height:"100%",background:props.color,borderRadius:3,transition:"width 0.4s ease"}} />
      </div>
      <span style={{fontSize:11,fontWeight:600,color:props.color,fontFamily:"var(--body)",minWidth:20}}>{props.value}</span>
    </div>
  );
}

function ChkGroup(props) {
  function toggle(v) {
    var s = new Set(props.selected);
    if (s.has(v)) s.delete(v); else s.add(v);
    props.onChange(Array.from(s));
  }
  return (
    <div style={{marginBottom:6}}>
      <div style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",marginBottom:5}}>{props.label}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {props.options.map(function(o) {
          var on = props.selected.indexOf(o) >= 0;
          var col = ST_COLORS[o] || null;
          return (
            <button key={o} onClick={function(){toggle(o)}} style={{
              fontSize:11,fontFamily:"var(--body)",fontWeight:600,padding:"3px 10px",borderRadius:6,cursor:"pointer",
              border: on ? "1px solid " + (col || C.primary) : "1px solid " + C.cardBorder,
              background: on ? (col ? col + "22" : C.primary + "22") : "transparent",
              color: on ? (col || C.primary) : C.textMuted
            }}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Collapsible Panel Wrapper ─── */
function Panel(props) {
  var _s = useState(props.defaultOpen || false); var open = _s[0]; var setOpen = _s[1];
  return (
    <div style={{background:C.card,borderRadius:12,border:"1px solid "+C.cardBorder,marginBottom:12,overflow:"hidden"}}>
      <button onClick={function(){setOpen(!open)}} style={{width:"100%",background:"none",border:"none",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{fontSize:13,color:C.text,fontFamily:"var(--head)",fontWeight:700}}>{props.title}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {props.subtitle && <span style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)"}}>{props.subtitle}</span>}
          <span style={{color:C.textMuted,fontSize:10}}>{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div style={{borderTop:"1px solid "+C.cardBorder,padding:props.noPad?"0":"12px 18px"}}>{props.children}</div>}
    </div>
  );
}

/* ─── Mortgage Parameters ─── */
function MortgageBar(props) {
  var cfg = props.cfg;
  var onChange = props.onChange;
  function MF(mfProps) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600}}>{mfProps.label}</label>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <input type="number" step={mfProps.step||"0.01"} value={cfg[mfProps.field]} onChange={function(e){var o=Object.assign({},cfg);o[mfProps.field]=parseFloat(e.target.value)||0;onChange(o)}}
            style={{width:80,background:C.inputBg,border:"1px solid "+C.inputBorder,borderRadius:6,padding:"5px 8px",color:C.text,fontSize:13,fontFamily:"var(--body)",outline:"none"}} />
          {mfProps.suffix && <span style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)"}}>{mfProps.suffix}</span>}
        </div>
      </div>
    );
  }
  return (
    <Panel title="Mortgage Parameters" subtitle={"15yr: " + cfg.rate15 + "% · 30yr: " + cfg.rate30 + "%"}>
      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
        <MF label="15-YR RATE" field="rate15" suffix="%" /><MF label="30-YR RATE" field="rate30" suffix="%" />
        <MF label="15-YR TERM" field="term15" suffix="yrs" step="1" /><MF label="30-YR TERM" field="term30" suffix="yrs" step="1" />
        <MF label="MIN DOWN" field="minDown" suffix="$" step="1000" /><MF label="DOWN %" field="downPct" suffix="%" step="1" />
        <MF label="INS %" field="insPct" suffix="% ann" /><MF label="TAX %" field="taxPct" suffix="% ann" />
      </div>
    </Panel>
  );
}

/* ─── Filter Panel ─── */
function FilterPanel(props) {
  var f = props.filters;
  function set(k,v) { var nf = Object.assign({}, f); nf[k] = v; props.onChange(nf); }
  function clearAll() { props.onChange({status:[],style:[],kitchen:[],bed:[],bath:[],parking:[]}); }
  return (
    <Panel title="Filters" defaultOpen={true}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <ChkGroup label="STATUS" options={STATUSES} selected={f.status} onChange={function(v){set("status",v)}} />
          <ChkGroup label="STYLE" options={S_OPTS} selected={f.style} onChange={function(v){set("style",v)}} />
          <ChkGroup label="KITCHEN" options={K_OPTS} selected={f.kitchen} onChange={function(v){set("kitchen",v)}} />
        </div>
        <div>
          <ChkGroup label="BEDROOMS" options={BED_OPTS} selected={f.bed} onChange={function(v){set("bed",v)}} />
          <ChkGroup label="BATHROOMS" options={BATH_OPTS} selected={f.bath} onChange={function(v){set("bath",v)}} />
          <ChkGroup label="PARKING" options={P_OPTS} selected={f.parking} onChange={function(v){set("parking",v)}} />
        </div>
      </div>
      <div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}}>
        <button onClick={clearAll} style={{fontSize:11,fontFamily:"var(--body)",color:C.textMuted,background:"none",border:"1px solid "+C.cardBorder,borderRadius:6,padding:"4px 12px",cursor:"pointer"}}>Clear All</button>
      </div>
    </Panel>
  );
}

/* ─── Map Panel ─── */
var mapScriptLoaded = false;
var mapScriptLoading = false;
var mapScriptCallbacks = [];

function loadGmapsScript(key, cb) {
  if (mapScriptLoaded) { cb(); return; }
  mapScriptCallbacks.push(cb);
  if (mapScriptLoading) return;
  mapScriptLoading = true;
  window._gmapsReady = function() {
    mapScriptLoaded = true;
    mapScriptLoading = false;
    for (var i = 0; i < mapScriptCallbacks.length; i++) mapScriptCallbacks[i]();
    mapScriptCallbacks = [];
  };
  var s = document.createElement("script");
  s.src = "https://maps.googleapis.com/maps/api/js?key=" + key + "&callback=_gmapsReady";
  s.async = true;
  document.head.appendChild(s);
}

function MapPanel(props) {
  var homes = props.homes;
  var gmapsKey = props.gmapsKey;
  var _s = useState(false); var open = _s[0]; var setOpen = _s[1];
  var _ready = useState(false); var ready = _ready[0]; var setReady = _ready[1];
  var mapRef = React.useRef(null);
  var mapInstance = React.useRef(null);
  var markersRef = React.useRef([]);
  var routesRef = React.useRef([]);
  var infoRef = React.useRef(null);
  var geocacheRef = React.useRef({});
  var workMarkerRef = React.useRef(null);

  useEffect(function() {
    if (!open || !gmapsKey) return;
    loadGmapsScript(gmapsKey, function() { setReady(true); });
  }, [open, gmapsKey]);

  useEffect(function() {
    if (!ready || !open || !mapRef.current) return;
    if (mapInstance.current) return;
    var gm = window.google.maps;
    mapInstance.current = new gm.Map(mapRef.current, {
      center: WORK_COORDS,
      zoom: 11,
      styles: [
        {featureType:"poi",elementType:"labels",stylers:[{visibility:"off"}]},
        {featureType:"transit",stylers:[{visibility:"off"}]}
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false
    });
    infoRef.current = new gm.InfoWindow();
    workMarkerRef.current = new gm.Marker({
      position: WORK_COORDS,
      map: mapInstance.current,
      icon: {
        path: gm.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#0d6efd",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2
      },
      title: "Work: " + WORK_ADDRESS,
      zIndex: 1000
    });
  }, [ready, open]);

  useEffect(function() {
    if (!ready || !open || !mapInstance.current) return;
    var gm = window.google.maps;
    var map = mapInstance.current;
    for (var i = 0; i < markersRef.current.length; i++) markersRef.current[i].setMap(null);
    markersRef.current = [];
    for (var j = 0; j < routesRef.current.length; j++) routesRef.current[j].setMap(null);
    routesRef.current = [];
    var geocoder = new gm.Geocoder();
    var directionsService = new gm.DirectionsService();
    var bounds = new gm.LatLngBounds();
    bounds.extend(WORK_COORDS);

    homes.forEach(function(h) {
      var fullAddr = h.address + ", " + (h.city || "Denver") + ", CO";
      var cached = geocacheRef.current[fullAddr];

      function placeMarker(pos) {
        var sc = ST_COLORS[h.status] || "#6c757d";
        var priceLabel = "$" + Math.round(h.price / 1000) + "k";
        var marker = new gm.Marker({
          position: pos,
          map: map,
          label: { text: priceLabel, color: "#fff", fontSize: "10px", fontWeight: "700" },
          icon: {
            path: "M-14,-8 L14,-8 L14,8 L-14,8 Z",
            fillColor: sc,
            fillOpacity: 0.9,
            strokeColor: "#fff",
            strokeWeight: 1,
            scale: 1,
            labelOrigin: new gm.Point(0, 0)
          },
          title: h.address,
          zIndex: h.status === "Good" ? 100 : h.status === "Out" ? 1 : 50
        });
        markersRef.current.push(marker);
        bounds.extend(pos);
        map.fitBounds(bounds, 40);

        marker.addListener("click", function() {
          var content = '<div style="font-family:Muli,sans-serif;color:#212529;max-width:220px">' +
            '<strong style="font-size:13px">' + h.address + '</strong><br>' +
            '<span style="font-size:12px;color:#6c757d">' + h.city + (h.neighborhood ? " · " + h.neighborhood : "") + '</span><br>' +
            '<span style="font-size:13px;font-weight:700;color:#55c278">$' + h.price.toLocaleString() + '</span>' +
            '<span style="font-size:11px;color:#888"> · ' + h.sqft + ' sqft</span><br>' +
            '<span style="font-size:11px;color:#888">' + h.bed + ' bed · ' + h.bath + ' bath · ' + h.style + '</span>' +
            (h.commute != null ? '<br><span style="font-size:11px;color:#0d6efd">🚗 ' + h.commute + ' min</span>' : '') +
            '<br><span style="display:inline-block;margin-top:4px;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:' + sc + '22;color:' + sc + '">' + h.status + '</span>' +
            '</div>';
          infoRef.current.setContent(content);
          infoRef.current.open(map, marker);
        });

        directionsService.route({
          origin: pos,
          destination: WORK_COORDS,
          travelMode: gm.TravelMode.DRIVING
        }, function(result, status) {
          if (status === "OK") {
            var renderer = new gm.DirectionsRenderer({
              map: map, directions: result, suppressMarkers: true,
              polylineOptions: { strokeColor: sc, strokeOpacity: 0.3, strokeWeight: 2 }
            });
            routesRef.current.push(renderer);
          }
        });
      }

      if (cached) { placeMarker(cached); }
      else {
        geocoder.geocode({ address: fullAddr }, function(results, status) {
          if (status === "OK" && results[0]) {
            var pos = results[0].geometry.location;
            geocacheRef.current[fullAddr] = pos;
            placeMarker(pos);
          }
        });
      }
    });
  }, [ready, open, homes]);

  if (!gmapsKey) return null;

  return (
    <div style={{background:C.card,borderRadius:12,border:"1px solid "+C.cardBorder,marginBottom:12,overflow:"hidden"}}>
      <button onClick={function(){setOpen(!open)}} style={{width:"100%",background:"none",border:"none",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{fontSize:13,color:C.text,fontFamily:"var(--head)",fontWeight:700}}>🗺️ Map</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)"}}>{homes.length} pins</span>
          <span style={{color:C.textMuted,fontSize:10}}>{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div style={{borderTop:"1px solid "+C.cardBorder}}>
        <div style={{padding:"8px 18px 4px",display:"flex",gap:12,flexWrap:"wrap",fontSize:10,fontFamily:"var(--body)"}}>
          {STATUSES.map(function(s){ return <span key={s} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:3,background:ST_COLORS[s],display:"inline-block"}}></span><span style={{color:C.textMuted}}>{s}</span></span> })}
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:"50%",background:"#0d6efd",display:"inline-block"}}></span><span style={{color:C.textMuted}}>Work</span></span>
        </div>
        <div ref={mapRef} style={{width:"100%",height:420}} />
      </div>}
    </div>
  );
}

/* ─── URL Extraction Modal ─── */
function UrlModal(props) {
  var _u = useState(""); var url = _u[0]; var setUrl = _u[1];
  var _p = useState("input"); var phase = _p[0]; var setPhase = _p[1];
  var _e = useState(null); var ext = _e[0]; var setExt = _e[1];
  var _er = useState(""); var err = _er[0]; var setErr = _er[1];

  function go() {
    if (!url.trim()) return;
    setPhase("loading"); setErr("");
    doExtractListing(url.trim()).then(function(d) {
      if (d && d.address) {
        doFetchCommute(d.address, d.city).then(function(commute) {
          setExt({address:d.address||"",city:d.city||"Denver",neighborhood:d.neighborhood||"",style:d.style||"Townhouse",price:d.price||0,sqft:d.sqft||0,bed:d.bed||2,bath:d.bath||1,hoa:d.hoa||0,kitchen:d.kitchen||"Open",parking:d.parking||"None",commute:commute,link:url.trim(),photoUrl:d.photoUrl||""});
          setPhase("review");
        });
      } else { setErr("Couldn't extract. Try another URL or add manually."); setPhase("error"); }
    }).catch(function(e) { setErr("Failed: " + e.message); setPhase("error"); });
  }

  function doConfirm() {
    if (!ext) return;
    props.onAdd(Object.assign({},ext,{downPayment:null,added:new Date().toISOString().slice(0,10),tourStatus:"",michelleRating:null,peterRating:null,notes:"",status:"Waiting"}));
    props.onClose();
  }

  function upd(k,v) { setExt(function(p){var n=Object.assign({},p);n[k]=v;return n}); }

  return (
    <div style={{position:"fixed",inset:0,background:"#00000066",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}} onClick={props.onClose}>
      <div style={{background:C.card,borderRadius:16,padding:28,width:"92%",maxWidth:640,maxHeight:"88vh",overflow:"auto",border:"1px solid "+C.cardBorder,boxShadow:"0 8px 32px #0002"}} onClick={function(e){e.stopPropagation()}}>
        <h2 style={{margin:"0 0 6px",color:C.text,fontFamily:"var(--head)",fontWeight:700,fontSize:22}}>Add from Listing URL</h2>
        <p style={{margin:"0 0 14px",fontSize:12,color:C.textMuted,fontFamily:"var(--body)"}}>Paste any listing link — Claude will search the web and extract details.</p>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <input type="url" value={url} onChange={function(e){setUrl(e.target.value)}} onKeyDown={function(e){if(e.key==="Enter")go()}} placeholder="https://www.redfin.com/CO/Denver/..."
            style={{flex:1,background:C.inputBg,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:14,fontFamily:"var(--body)",outline:"none"}} />
          <button onClick={go} disabled={phase==="loading"} style={{background:phase==="loading"?C.cardBorder:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:700,whiteSpace:"nowrap"}}>{phase==="loading"?"Searching...":"Extract"}</button>
        </div>
        {phase==="loading" && <div style={{textAlign:"center",padding:30,fontSize:14,color:C.textMuted,fontFamily:"var(--body)"}}>Claude is searching the listing...</div>}
        {phase==="error" && <div style={{padding:14,background:"#dc354511",border:"1px solid #dc354533",borderRadius:10}}><p style={{margin:0,color:"#dc3545",fontSize:13,fontFamily:"var(--body)"}}>{err}</p></div>}
        {phase==="review" && ext && <div>
          <div style={{padding:10,background:C.primary+"11",border:"1px solid "+C.primary+"33",borderRadius:10,marginBottom:12,fontSize:12,color:C.primary,fontFamily:"var(--body)"}}>Extracted — review and adjust</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <EF label="Address" value={ext.address} onChange={function(v){upd("address",v)}} span="1/-1" />
            <EF label="City" value={ext.city} onChange={function(v){upd("city",v)}} />
            <EF label="Neighborhood" value={ext.neighborhood} onChange={function(v){upd("neighborhood",v)}} />
            <ES label="Style" value={ext.style} options={S_OPTS} onChange={function(v){upd("style",v)}} />
            <EF label="Price" value={ext.price} type="number" onChange={function(v){upd("price",parseFloat(v)||0)}} />
            <EF label="Sq Ft" value={ext.sqft} type="number" onChange={function(v){upd("sqft",parseFloat(v)||0)}} />
            <EF label="HOA" value={ext.hoa} type="number" onChange={function(v){upd("hoa",parseFloat(v)||0)}} />
            <EF label="Beds" value={ext.bed} type="number" onChange={function(v){upd("bed",parseFloat(v)||0)}} />
            <EF label="Baths" value={ext.bath} type="number" onChange={function(v){upd("bath",parseFloat(v)||0)}} />
            <ES label="Kitchen" value={ext.kitchen} options={K_OPTS} onChange={function(v){upd("kitchen",v)}} />
            <ES label="Parking" value={ext.parking} options={P_OPTS} onChange={function(v){upd("parking",v)}} />
            <EF label="Commute" value={ext.commute != null ? ext.commute : ""} type="number" onChange={function(v){upd("commute",v?parseFloat(v):null)}} />
            <EF label="Photo URL" value={ext.photoUrl||""} onChange={function(v){upd("photoUrl",v)}} span="1/-1" />
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
            <button onClick={props.onClose} style={{background:C.inputBg,color:C.textMuted,border:"1px solid "+C.cardBorder,borderRadius:8,padding:"10px 24px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:600}}>CANCEL</button>
            <button onClick={doConfirm} style={{background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:700}}>ADD HOME</button>
          </div>
        </div>}
      </div>
    </div>
  );
}

/* ─── Manual Add Modal ─── */
function ManualModal(props) {
  var _f = useState({address:"",city:"Denver",neighborhood:"",style:"Townhouse",price:"",sqft:"",downPayment:"",hoa:"",commute:"",bed:"2",bath:"1",kitchen:"Open",parking:"Reserved (1)",link:"",photoUrl:"",notes:""});
  var f = _f[0]; var sf = _f[1];
  function s(k,v){ sf(function(p){var n=Object.assign({},p);n[k]=v;return n}) }
  function go(){
    if(!f.address||!f.price)return;
    props.onAdd({address:f.address,city:f.city,neighborhood:f.neighborhood,style:f.style,price:parseFloat(f.price)||0,sqft:parseFloat(f.sqft)||0,downPayment:f.downPayment?parseFloat(f.downPayment):null,hoa:parseFloat(f.hoa)||0,commute:f.commute?parseFloat(f.commute):null,bed:parseFloat(f.bed)||2,bath:parseFloat(f.bath)||1,kitchen:f.kitchen,parking:f.parking,link:f.link,photoUrl:f.photoUrl||null,added:new Date().toISOString().slice(0,10),tourStatus:"",michelleRating:null,peterRating:null,notes:f.notes,status:"Waiting"});
    props.onClose();
  }
  return (
    <div style={{position:"fixed",inset:0,background:"#00000066",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}} onClick={props.onClose}>
      <div style={{background:C.card,borderRadius:16,padding:28,width:"92%",maxWidth:580,maxHeight:"88vh",overflow:"auto",border:"1px solid "+C.cardBorder,boxShadow:"0 8px 32px #0002"}} onClick={function(e){e.stopPropagation()}}>
        <h2 style={{margin:"0 0 18px",color:C.text,fontFamily:"var(--head)",fontWeight:700,fontSize:22}}>Add Manually</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <EF label="Address" value={f.address} onChange={function(v){s("address",v)}} span="1/-1" />
          <EF label="City" value={f.city} onChange={function(v){s("city",v)}} />
          <EF label="Neighborhood" value={f.neighborhood} onChange={function(v){s("neighborhood",v)}} />
          <ES label="Style" value={f.style} options={S_OPTS} onChange={function(v){s("style",v)}} />
          <EF label="Price" value={f.price} type="number" onChange={function(v){s("price",v)}} />
          <EF label="Sq Ft" value={f.sqft} type="number" onChange={function(v){s("sqft",v)}} />
          <EF label="Down Pmt" value={f.downPayment} type="number" onChange={function(v){s("downPayment",v)}} />
          <EF label="HOA" value={f.hoa} type="number" onChange={function(v){s("hoa",v)}} />
          <EF label="Commute" value={f.commute} type="number" onChange={function(v){s("commute",v)}} />
          <EF label="Beds" value={f.bed} type="number" onChange={function(v){s("bed",v)}} />
          <EF label="Baths" value={f.bath} type="number" onChange={function(v){s("bath",v)}} />
          <ES label="Kitchen" value={f.kitchen} options={K_OPTS} onChange={function(v){s("kitchen",v)}} />
          <ES label="Parking" value={f.parking} options={P_OPTS} onChange={function(v){s("parking",v)}} />
          <EF label="Listing Link" value={f.link} onChange={function(v){s("link",v)}} />
          <EF label="Photo URL" value={f.photoUrl} onChange={function(v){s("photoUrl",v)}} />
          <EF label="Notes" value={f.notes} onChange={function(v){s("notes",v)}} span="1/-1" />
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:18}}>
          <button onClick={props.onClose} style={{background:C.inputBg,color:C.textMuted,border:"1px solid "+C.cardBorder,borderRadius:8,padding:"10px 24px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:600}}>CANCEL</button>
          <button onClick={go} style={{background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:700}}>ADD HOME</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Home Card ─── */
function HomeCard(props) {
  var h = props.home, u = props.onUpdate, del = props.onDelete, ex = props.expanded, tog = props.onToggle, cfg = props.cfg;
  var dp = h.downPayment != null ? h.downPayment : calcDown(h.price, cfg);
  var ln = h.price - dp;
  var m30 = calcPmt(cfg.rate30, cfg.term30, ln);
  var m15 = calcPmt(cfg.rate15, cfg.term15, ln);
  var ins = (cfg.insPct / 100) * h.price / 12;
  var tax = (cfg.taxPct / 100) * h.price / 12;
  var tot30 = m30 + (h.hoa || 0) + ins + tax;
  var tot15 = m15 + (h.hoa || 0) + ins + tax;
  var mR = h.michelleRating, pR = h.peterRating;
  var tR = (mR != null || pR != null) ? (mR || 0) + (pR || 0) : null;
  var sc = ST_COLORS[h.status] || ST_COLORS.Waiting;
  var ppsf = h.sqft ? (h.price / h.sqft).toFixed(0) : "—";

  var addrContent = h.link
    ? <a href={h.link} target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"none",borderBottom:"1px solid "+C.primary+"55",paddingBottom:1}}>{h.address}</a>
    : h.address;

  return (
    <div style={{background:C.card,borderRadius:12,border:"1px solid "+C.cardBorder,overflow:"hidden",boxShadow:"0 1px 4px #0001"}}>
      <div style={{height:4,background:sc}} />
      <div style={{display:"flex"}}>
        {h.photoUrl && <div style={{width:120,minHeight:100,flexShrink:0,overflow:"hidden",background:C.inputBg}}>
          <img src={h.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={function(e){e.target.parentElement.style.display="none"}} />
        </div>}
        <div style={{padding:"14px 18px",flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <h3 style={{margin:0,fontSize:16,fontFamily:"var(--head)",fontWeight:700,color:C.text}}>{addrContent}</h3>
                <span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:6,background:sc+"22",color:sc,fontFamily:"var(--body)"}}>{h.status}</span>
                {h.tourStatus && <span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:6,background:C.inputBg,color:C.textMuted,fontFamily:"var(--body)"}}>{h.tourStatus}</span>}
              </div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:2,fontFamily:"var(--body)"}}>{h.city}{h.neighborhood ? " · " + h.neighborhood : ""} · {h.style}</div>
            </div>
            <div style={{textAlign:"right",minWidth:110,flexShrink:0}}>
              <div style={{fontSize:20,fontWeight:800,color:C.primary,fontFamily:"var(--head)"}}>${h.price.toLocaleString()}</div>
              <div style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)"}}>${ppsf}/sqft · {h.sqft.toLocaleString()}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:8,fontSize:12,fontFamily:"var(--body)"}}>
            <span style={{color:C.textMuted}}>Bed <strong style={{color:C.text}}>{h.bed}</strong></span>
            <span style={{color:C.textMuted}}>Bath <strong style={{color:C.text}}>{h.bath}</strong></span>
            <span style={{color:C.textMuted}}>Kitchen <strong style={{color:C.text}}>{h.kitchen}</strong></span>
            <span style={{color:C.textMuted}}>Parking <strong style={{color:C.text}}>{h.parking}</strong></span>
            <span style={{color:C.textMuted}}>HOA <strong style={{color:h.hoa>400?"#dc3545":C.text}}>{h.hoa>0?"$"+h.hoa:"—"}</strong></span>
            <span style={{color:C.textMuted}}>15yr <strong style={{color:C.text}}>${fmtNum(tot15)}</strong></span>
            <span style={{color:C.textMuted}}>30yr <strong style={{color:C.primary}}>${fmtNum(tot30)}</strong></span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <RatingBar label="M" value={mR} color="#e83e8c" />
            <RatingBar label="P" value={pR} color={C.primary} />
            {tR != null && <span style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:"var(--body)",background:C.inputBg,padding:"1px 8px",borderRadius:7}}>{"Σ " + tR + ((mR==null||pR==null)?"*":"")}</span>}
            {h.commute != null && <span style={{fontSize:11,fontWeight:600,color:"#0d6efd",fontFamily:"var(--body)",background:"#0d6efd11",padding:"1px 7px",borderRadius:5,marginLeft:"auto"}}>{"🚗 " + h.commute + " min"}</span>}
            {h.notes && <span style={{fontSize:12,color:C.textMuted,fontStyle:"italic"}}>{h.notes}</span>}
          </div>
          <button onClick={function(){tog(h.id)}} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",marginTop:8,padding:"4px 0"}}>{ex ? "▲ COLLAPSE" : "▼ EDIT / DETAILS"}</button>
          {ex && <div style={{marginTop:12,padding:14,background:C.inputBg,borderRadius:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <EF label="Address" value={h.address} onChange={function(v){u(h.id,"address",v)}} />
            <EF label="City" value={h.city} onChange={function(v){u(h.id,"city",v)}} />
            <EF label="Neighborhood" value={h.neighborhood} onChange={function(v){u(h.id,"neighborhood",v)}} />
            <EF label="Price" value={h.price} type="number" onChange={function(v){u(h.id,"price",parseFloat(v)||0)}} />
            <EF label="Sq Ft" value={h.sqft} type="number" onChange={function(v){u(h.id,"sqft",parseFloat(v)||0)}} />
            <EF label="Down Pmt" value={dp} type="number" onChange={function(v){u(h.id,"downPayment",parseFloat(v)||0)}} />
            <EF label="HOA" value={h.hoa} type="number" onChange={function(v){u(h.id,"hoa",parseFloat(v)||0)}} />
            <EF label="Commute" value={h.commute||""} type="number" onChange={function(v){u(h.id,"commute",v?parseFloat(v):null)}} />
            <EF label="Beds" value={h.bed} type="number" onChange={function(v){u(h.id,"bed",parseFloat(v)||0)}} />
            <EF label="Baths" value={h.bath} type="number" onChange={function(v){u(h.id,"bath",parseFloat(v)||0)}} />
            <ES label="Kitchen" value={h.kitchen} options={K_OPTS} onChange={function(v){u(h.id,"kitchen",v)}} />
            <ES label="Style" value={h.style} options={S_OPTS} onChange={function(v){u(h.id,"style",v)}} />
            <ES label="Parking" value={h.parking} options={P_OPTS} onChange={function(v){u(h.id,"parking",v)}} />
            <ES label="Status" value={h.status} options={STATUSES} onChange={function(v){u(h.id,"status",v)}} />
            <EF label="Listing Link" value={h.link||""} onChange={function(v){u(h.id,"link",v)}} />
            <EF label="Tour Status" value={h.tourStatus||""} onChange={function(v){u(h.id,"tourStatus",v)}} />
            <EF label="Michelle (/10)" value={h.michelleRating!=null?h.michelleRating:""} type="number" onChange={function(v){u(h.id,"michelleRating",v===""?null:parseFloat(v))}} />
            <EF label="Peter (/10)" value={h.peterRating!=null?h.peterRating:""} type="number" onChange={function(v){u(h.id,"peterRating",v===""?null:parseFloat(v))}} />
            <EF label="Photo URL" value={h.photoUrl||""} onChange={function(v){u(h.id,"photoUrl",v)}} />
            <EF label="Notes" value={h.notes||""} onChange={function(v){u(h.id,"notes",v)}} />
            <div style={{gridColumn:"1/-1",borderTop:"1px solid "+C.cardBorder,paddingTop:10,marginTop:4}}>
              <div style={{display:"flex",gap:18,flexWrap:"wrap",fontSize:12,color:C.textMuted,fontFamily:"var(--body)"}}>
                <span>15yr: <strong style={{color:C.text}}>${fmtNum(m15)}/mo</strong></span>
                <span>30yr: <strong style={{color:C.primary}}>${fmtNum(m30)}/mo</strong></span>
                <span>Ins: <strong style={{color:C.text}}>${fmtNum(ins)}/mo</strong></span>
                <span>Tax: <strong style={{color:C.text}}>${fmtNum(tax)}/mo</strong></span>
                <span>15yr Total: <strong style={{color:"#e83e8c"}}>${fmtNum(tot15)}/mo</strong></span>
                <span>30yr Total: <strong style={{color:"#e83e8c"}}>${fmtNum(tot30)}/mo</strong></span>
                <span>Loan: <strong style={{color:C.text}}>${ln.toLocaleString()}</strong></span>
              </div>
            </div>
            <div style={{gridColumn:"1/-1",display:"flex",justifyContent:"flex-end"}}>
              <button onClick={function(){del(h.id)}} style={{background:"#dc354511",color:"#dc3545",border:"1px solid #dc354533",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:12,fontFamily:"var(--body)",fontWeight:600}}>DELETE</button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Passcode Login ─── */
function LoginScreen(props) {
  var _p = useState(""); var pw = _p[0]; var setPw = _p[1];
  var _err = useState(""); var err = _err[0]; var setErr = _err[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

  function go() {
    if (!pw) return;
    setLoading(true); setErr("");
    signInWithEmailAndPassword(auth, AUTH_EMAIL, pw)
      .then(function() { props.onAuth(true); })
      .catch(function() { setErr("Incorrect passcode"); setLoading(false); });
  }

  return (
    <div style={{minHeight:"100vh",background:C.primaryLight,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--body)"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@500;700&family=Muli:wght@400;700;800&display=swap');:root{--head:'Saira Extra Condensed',sans-serif;--body:'Muli',sans-serif}*{box-sizing:border-box}input:focus{border-color:${C.primary}!important;outline:none}`}</style>
      <div style={{background:C.card,borderRadius:20,padding:40,width:"90%",maxWidth:380,border:"1px solid "+C.cardBorder,textAlign:"center",boxShadow:"0 8px 32px #0002"}}>
        <div style={{width:56,height:56,borderRadius:14,background:C.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px",color:"#fff"}}>🏠</div>
        <h1 style={{margin:"0 0 4px",fontSize:28,fontWeight:700,color:C.text,fontFamily:"var(--head)"}}>Home Search HQ</h1>
        <p style={{margin:"0 0 24px",fontSize:12,color:C.textMuted,fontFamily:"var(--body)"}}>Enter passcode to continue</p>
        <input type="password" value={pw} onChange={function(e){setPw(e.target.value)}} onKeyDown={function(e){if(e.key==="Enter")go()}} placeholder="Passcode"
          style={{width:"100%",background:C.inputBg,border:"1px solid " + (err ? "#dc3545" : C.inputBorder),borderRadius:10,padding:"12px 16px",color:C.text,fontSize:15,fontFamily:"var(--body)",textAlign:"center",marginBottom:14,outline:"none"}} />
        {err && <p style={{margin:"0 0 10px",fontSize:12,color:"#dc3545",fontFamily:"var(--body)"}}>{err}</p>}
        <button onClick={go} disabled={loading} style={{width:"100%",background:loading?C.cardBorder:C.primary,color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontFamily:"var(--body)",fontWeight:700}}>{loading ? "Signing in..." : "Enter"}</button>
      </div>
    </div>
  );
}

/* ─── Dashboard ─── */
function Dashboard() {
  var _h = useState([]); var homes = _h[0]; var setHomes = _h[1];
  var _ex = useState(null); var exId = _ex[0]; var setExId = _ex[1];
  var _m = useState(null); var modal = _m[0]; var setModal = _m[1];
  var _so = useState("price"); var sortBy = _so[0]; var setSortBy = _so[1];
  var _cd = useState("asc"); var comDir = _cd[0]; var setComDir = _cd[1];
  var _sr = useState(""); var search = _sr[0]; var setSearch = _sr[1];
  var _cfg = useState(DEFAULT_CFG); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _fi = useState({status:[],style:[],kitchen:[],bed:[],bath:[],parking:[]});
  var filters = _fi[0]; var setFilters = _fi[1];

  useEffect(function() {
    var unsub = onSnapshot(collection(db, "homes"), function(snap) {
      var data = snap.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });
      setHomes(data);
    });
    return unsub;
  }, []);

  function upd(id, field, val) { var update = {}; update[field] = val; updateDoc(doc(db, "homes", id), update); }
  function del(id) { deleteDoc(doc(db, "homes", id)); }
  function add(h) { addDoc(collection(db, "homes"), h); }
  function doSignOut() { signOut(auth); }

  function matchBed(h, sel) { if(!sel.length) return true; for(var i=0;i<sel.length;i++){if(sel[i]==="4+"&&h.bed>=4)return true;if(h.bed===parseFloat(sel[i]))return true} return false; }
  function matchBath(h, sel) { if(!sel.length) return true; for(var i=0;i<sel.length;i++){if(sel[i]==="3+"&&h.bath>=3)return true;if(h.bath===parseFloat(sel[i]))return true} return false; }

  var filtered = useMemo(function() {
    var list = homes.slice();
    if (filters.status.length) list = list.filter(function(h){return filters.status.indexOf(h.status)>=0});
    if (filters.style.length) list = list.filter(function(h){return filters.style.indexOf(h.style)>=0});
    if (filters.kitchen.length) list = list.filter(function(h){return filters.kitchen.indexOf(h.kitchen)>=0});
    if (filters.parking.length) list = list.filter(function(h){return filters.parking.indexOf(h.parking)>=0});
    if (filters.bed.length) list = list.filter(function(h){return matchBed(h,filters.bed)});
    if (filters.bath.length) list = list.filter(function(h){return matchBath(h,filters.bath)});
    if (search) { var t = search.toLowerCase(); list = list.filter(function(h){return h.address.toLowerCase().indexOf(t)>=0||h.city.toLowerCase().indexOf(t)>=0||(h.neighborhood||"").toLowerCase().indexOf(t)>=0||(h.notes||"").toLowerCase().indexOf(t)>=0}); }
    if (sortBy === "price") list.sort(function(a,b){return a.price-b.price});
    else if (sortBy === "price-desc") list.sort(function(a,b){return b.price-a.price});
    else if (sortBy === "sqft") list.sort(function(a,b){return b.sqft-a.sqft});
    else if (sortBy === "rating") list.sort(function(a,b){ function r(h){var x=[];if(h.michelleRating!=null)x.push(h.michelleRating);if(h.peterRating!=null)x.push(h.peterRating);var s=0;for(var i=0;i<x.length;i++)s+=x[i];return x.length?s:-1} return r(b)-r(a) });
    else if (sortBy === "monthly") list.sort(function(a,b){ function t(h){var d=h.downPayment!=null?h.downPayment:calcDown(h.price,cfg);return calcPmt(cfg.rate30,cfg.term30,h.price-d)+(h.hoa||0)+(cfg.insPct/100)*h.price/12+(cfg.taxPct/100)*h.price/12} return t(a)-t(b) });
    else if (sortBy === "added") list.sort(function(a,b){return (b.added||"").localeCompare(a.added||"")});
    else if (sortBy === "commute") { if(comDir==="asc") list.sort(function(a,b){return (a.commute||999)-(b.commute||999)}); else list.sort(function(a,b){return (b.commute||-1)-(a.commute||-1)}); }
    return list;
  }, [homes, filters, search, sortBy, cfg, comDir]);

  var activeCount = homes.filter(function(h){return h.status!=="Out"}).length;
  var touredCount = homes.filter(function(h){return h.tourStatus && h.tourStatus.indexOf("Toured")>=0}).length;
  var activeHomes = homes.filter(function(h){return h.status!=="Out"});
  var avgPrice = activeHomes.length ? activeHomes.reduce(function(s,h){return s+h.price},0)/activeHomes.length : 0;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"var(--body)",color:C.text}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@500;700&family=Muli:wght@400;700;800&display=swap');:root{--head:'Saira Extra Condensed',sans-serif;--body:'Muli',sans-serif}*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.cardBorder};border-radius:3px}input:focus,select:focus{border-color:${C.primary}!important}`}</style>
      <div style={{maxWidth:960,margin:"0 auto",padding:"28px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <div style={{width:36,height:36,borderRadius:10,background:C.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,color:"#fff"}}>🏠</div>
          <div style={{flex:1}}>
            <h1 style={{margin:0,fontSize:30,fontWeight:700,letterSpacing:"-0.01em",color:C.primary,fontFamily:"var(--head)"}}>Home Search HQ</h1>
            <p style={{margin:0,fontSize:12,color:C.textMuted,fontFamily:"var(--body)"}}>Peter & Michelle · Denver Metro · {homes.length} properties</p>
          </div>
          <button onClick={doSignOut} style={{background:"none",border:"1px solid "+C.cardBorder,borderRadius:8,padding:"6px 14px",color:C.textMuted,cursor:"pointer",fontSize:11,fontFamily:"var(--body)"}}>Sign Out</button>
        </div>

        <MortgageBar cfg={cfg} onChange={setCfg} />

        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#0d6efd"}}>📍</span> Commute to: <span style={{color:"#0d6efd"}}>{WORK_ADDRESS}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
            {[["Total",homes.length,C.primary],["Active",activeCount,"#28a745"],["Toured",touredCount,"#6f42c1"],["Avg Price","$"+Math.round(avgPrice/1000)+"k","#e83e8c"]].map(function(item){
              return <div key={item[0]} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:"3px solid "+item[2],border:"1px solid "+C.cardBorder,borderLeftWidth:3,borderLeftColor:item[2]}}>
                <div style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.06em",marginBottom:4}}>{item[0].toUpperCase()}</div>
                <div style={{fontSize:24,fontWeight:700,color:item[2],fontFamily:"var(--head)"}}>{item[1]}</div>
              </div>
            })}
          </div>
        </div>

        <FilterPanel filters={filters} onChange={setFilters} />
        <MapPanel homes={filtered} gmapsKey={GMAPS_CLIENT_KEY} />

        <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
          <input type="text" placeholder="Search address, city, notes..." value={search} onChange={function(e){setSearch(e.target.value)}}
            style={{flex:"1 1 180px",background:C.card,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:"var(--body)",outline:"none",minWidth:160}} />
          <select value={sortBy} onChange={function(e){setSortBy(e.target.value)}} style={{background:C.card,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,fontFamily:"var(--body)",outline:"none",cursor:"pointer"}}>
            <option value="price">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="sqft">Sq Ft ↓</option>
            <option value="rating">Rating ↓</option>
            <option value="monthly">Monthly ↑</option>
            <option value="added">Recent</option>
            <option value="commute">Commute</option>
          </select>
          {sortBy === "commute" && <button onClick={function(){setComDir(function(d){return d==="asc"?"desc":"asc"})}} style={{background:C.card,color:"#0d6efd",border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 12px",cursor:"pointer",fontSize:12,fontFamily:"var(--body)",fontWeight:600}}>{comDir==="asc"?"↑ Nearest":"↓ Farthest"}</button>}
          <button onClick={function(){setModal("url")}} style={{background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:700,whiteSpace:"nowrap"}}>🔗 PASTE LINK</button>
          <button onClick={function(){setModal("manual")}} style={{background:C.card,color:C.text,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:600,whiteSpace:"nowrap"}}>+ MANUAL</button>
        </div>

        <div style={{fontSize:12,color:C.textMuted,fontFamily:"var(--body)",marginBottom:12}}>Showing {filtered.length} of {homes.length}</div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(function(h) {
            return <HomeCard key={h.id} home={h} onUpdate={upd} onDelete={del} expanded={exId===h.id} onToggle={function(id){setExId(function(p){return p===id?null:id})}} cfg={cfg} />;
          })}
        </div>

        {filtered.length === 0 && <div style={{textAlign:"center",padding:60,color:C.textMuted}}>
          <div style={{fontSize:40,marginBottom:12}}>🔍</div>
          <div style={{fontSize:14,fontFamily:"var(--body)"}}>No homes match your filters</div>
        </div>}
      </div>
      {modal === "url" && <UrlModal onAdd={add} onClose={function(){setModal(null)}} cfg={cfg} />}
      {modal === "manual" && <ManualModal onAdd={add} onClose={function(){setModal(null)}} />}
    </div>
  );
}

/* ─── App Entry ─── */
export default function App() {
  var _a = useState(false); var authed = _a[0]; var setAuthed = _a[1];
  var _l = useState(true); var loading = _l[0]; var setLoading = _l[1];

  useEffect(function() {
    var unsub = onAuthStateChanged(auth, function(user) {
      setAuthed(!!user);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return null;
  if (!authed) return <LoginScreen onAuth={setAuthed} />;
  return <Dashboard />;
}
