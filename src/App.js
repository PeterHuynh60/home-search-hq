import React, { useState, useMemo, useEffect } from "react";
import { db, auth, extractListingFn, getCommuteFn } from "./firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

var WORK_ADDRESS = "1635 Aurora Ct, Aurora, CO 80045";
var WORK_COORDS = { lat: 39.7392, lng: -104.8374 };
var DEFAULT_CFG = { rate15:4.6, rate30:5.75, term15:15, term30:30, maxDown:80000, downPct:20, insPct:0.5, taxPct:0.55 };
var STATUSES = ["Excellent","Good","Hmm...","Meh","Out","Waiting"];
var ST_COLORS = { Excellent:"#0d6efd","Good":"#28a745","Hmm...":"#ffc107",Meh:"#fd7e14",Out:"#dc3545",Waiting:"#17a2b8" };

function autoStatus(home) {
  if (home.sold || home.pending || home.tooExpensive) return "Out";
  var mR = home.michelleRating, pR = home.peterRating;
  if (mR == null || pR == null) return "Waiting";
  var total = mR + pR;
  if (total >= 14) return "Excellent";
  if (total >= 12) return "Good";
  if (total >= 10) return "Hmm...";
  if (total >= 8) return "Meh";
  return "Out";
}
var K_OPTS = ["Open","Closed","Halfway"];
var S_OPTS = ["House","Townhouse","Condo"];
var P_OPTS = ["None","Reserved (1)","Reserved (2)","Garage (1)","Garage (2)"];
var BED_OPTS = ["1","2","3","4+"];
var BATH_OPTS = ["1","1.5","2","2.5","3+"];
var GMAPS_CLIENT_KEY = ""; // Paste your Google Maps JS API key here
var AUTH_EMAIL = "home@search.hq";

/* ─── Color Palette (matches huynh.place / bet.huynh.place) ─── */
var C = {
  primary: "#55c278",
  primaryDark: "#48a869",
  primaryLight: "#77CE93",
  primaryBg: "#e8f5ee",
  bg: "#f0f7f3",
  card: "#ffffff",
  cardBorder: "#c8e6d3",
  text: "#212529",
  textMuted: "#6c757d",
  textLight: "#888",
  heading: "#55c278",
  inputBg: "#f8faf9",
  inputBorder: "#b8d8c5"
};

function calcPmt(ratePct, years, principal) {
  if (!ratePct || !years || principal <= 0) return 0;
  var r = ratePct / 100 / 12;
  var n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcDown(price, cfg) {
  var pctDown = price * (cfg.downPct / 100);
  return Math.min(pctDown, cfg.maxDown);
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

async function doFetchCommute(addr, city, departureTime) {
  try {
    var params = { address: addr, city: city };
    if (departureTime) params.departureTime = departureTime;
    var result = await getCommuteFn(params);
    return result.data.commute;
  } catch (e) {
    console.error("Commute fail:", e);
    return null;
  }
}

/* ─── Shared Styles ─── */
var ist = {background:C.inputBg,border:"1px solid "+C.inputBorder,borderRadius:6,padding:"6px 8px",color:C.text,fontSize:13,fontFamily:"var(--body)",outline:"none",boxSizing:"border-box",width:"100%"};

function EF(props) {
  var _ls = useState(props.value != null ? props.value : ""); var local = _ls[0]; var setLocal = _ls[1];
  var _foc = useState(false); var focused = _foc[0]; var setFocused = _foc[1];
  var inputRef = useRef(null);
  var timerRef = useRef(null);

  // Sync from parent only when not focused
  useEffect(function() {
    if (!focused) setLocal(props.value != null ? props.value : "");
  }, [props.value, focused]);

  function handleChange(e) {
    var v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(function() { props.onChange(v); }, 600);
  }

  function handleBlur() {
    setFocused(false);
    clearTimeout(timerRef.current);
    props.onChange(local);
  }

  return (
    <div style={props.span ? {gridColumn:props.span} : {}}>
      <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",display:"block",marginBottom:3}}>{props.label.toUpperCase()}</label>
      <input ref={inputRef} type={props.type || "text"} value={local} onChange={handleChange} onFocus={function(){setFocused(true)}} onBlur={handleBlur} step={props.type === "number" ? "0.5" : undefined} style={ist} />
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

/* ─── Mortgage Field (stable - defined outside) ─── */
function MortgageField(props) {
  var inputRef = React.useRef(null);
  var _val = useState(props.value); var val = _val[0]; var setVal = _val[1];
  var timerRef = React.useRef(null);

  // Sync from parent only when not focused
  useEffect(function() {
    if (inputRef.current !== document.activeElement) {
      setVal(props.value);
    }
  }, [props.value]);

  function handleChange(e) {
    var v = e.target.value;
    setVal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(function() {
      props.onCommit(parseFloat(v) || 0);
    }, 600);
  }

  function handleBlur() {
    if (timerRef.current) clearTimeout(timerRef.current);
    props.onCommit(parseFloat(val) || 0);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:3}}>
      <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600}}>{props.label}</label>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input ref={inputRef} type="number" step={props.step||"0.01"} value={val} onChange={handleChange} onBlur={handleBlur}
          style={{width:80,background:C.inputBg,border:"1px solid "+C.inputBorder,borderRadius:6,padding:"5px 8px",color:C.text,fontSize:13,fontFamily:"var(--body)",outline:"none"}} />
        {props.suffix && <span style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)"}}>{props.suffix}</span>}
      </div>
    </div>
  );
}

/* ─── Mortgage Parameters ─── */
function MortgageBar(props) {
  var cfg = props.cfg;
  var onChange = props.onChange;

  function commit(field, val) {
    var o = Object.assign({}, cfg);
    o[field] = val;
    onChange(o);
  }

  return (
    <Panel title="Mortgage Parameters" subtitle={"15yr: " + cfg.rate15 + "% · 30yr: " + cfg.rate30 + "%"}>
      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
        <MortgageField label="15-YR RATE" value={cfg.rate15} suffix="%" onCommit={function(v){commit("rate15",v)}} />
        <MortgageField label="30-YR RATE" value={cfg.rate30} suffix="%" onCommit={function(v){commit("rate30",v)}} />
        <MortgageField label="15-YR TERM" value={cfg.term15} suffix="yrs" step="1" onCommit={function(v){commit("term15",v)}} />
        <MortgageField label="30-YR TERM" value={cfg.term30} suffix="yrs" step="1" onCommit={function(v){commit("term30",v)}} />
        <MortgageField label="MAX DOWN" value={cfg.maxDown} suffix="$" step="1000" onCommit={function(v){commit("maxDown",v)}} />
        <MortgageField label="DOWN %" value={cfg.downPct} suffix="%" step="1" onCommit={function(v){commit("downPct",v)}} />
        <MortgageField label="INS %" value={cfg.insPct} suffix="% ann" onCommit={function(v){commit("insPct",v)}} />
        <MortgageField label="TAX %" value={cfg.taxPct} suffix="% ann" onCommit={function(v){commit("taxPct",v)}} />
      </div>
    </Panel>
  );
}

/* ─── Filter Panel (legacy - for mobile fallback) ─── */
function FilterPanel(props) {
  var f = props.filters;
  function set(k,v) { var nf = Object.assign({}, f); nf[k] = v; props.onChange(nf); }
  function clearAll() { props.onChange({status:[],style:[],kitchen:[],bed:[],bath:[],parking:[],toured:false,momPick:false}); }
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
      <div style={{display:"flex",gap:12,alignItems:"center",marginTop:8,flexWrap:"wrap"}}>
        <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:f.toured?"#28a745":C.textMuted}}><input type="checkbox" checked={f.toured} onChange={function(e){set("toured",e.target.checked)}} /> Toured Only</label>
        <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:f.momPick?"#e91e9c":C.textMuted}}><input type="checkbox" checked={f.momPick} onChange={function(e){set("momPick",e.target.checked)}} /> Mom's Picks</label>
      </div>
      <div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}}>
        <button onClick={clearAll} style={{fontSize:11,fontFamily:"var(--body)",color:C.textMuted,background:"none",border:"1px solid "+C.cardBorder,borderRadius:6,padding:"4px 12px",cursor:"pointer"}}>Clear All</button>
      </div>
    </Panel>
  );
}

/* ─── Sidebar Filters (sticky) ─── */
function SidebarFilters(props) {
  var f = props.filters;
  function set(k,v) { var nf = Object.assign({}, f); nf[k] = v; props.onChange(nf); }
  function clearAll() { props.onChange({status:[],style:[],kitchen:[],bed:[],bath:[],parking:[],toured:false,momPick:false}); }
  var activeCount = 0;
  var keys = ["status","style","kitchen","bed","bath","parking"];
  for (var i = 0; i < keys.length; i++) { if (f[keys[i]].length) activeCount += f[keys[i]].length; }
  if (f.toured) activeCount++;
  if (f.momPick) activeCount++;
  return (
    <div style={{background:C.card,borderRadius:12,border:"1px solid "+C.cardBorder,padding:"14px 14px 10px",fontFamily:"var(--body)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:700,fontFamily:"var(--head)",color:C.text}}>Filters</span>
        {activeCount > 0 && <button onClick={clearAll} style={{fontSize:10,fontFamily:"var(--body)",color:"#dc3545",background:"none",border:"1px solid #dc354533",borderRadius:5,padding:"2px 8px",cursor:"pointer"}}>Clear ({activeCount})</button>}
      </div>
      <ChkGroup label="STATUS" options={STATUSES} selected={f.status} onChange={function(v){set("status",v)}} />
      <ChkGroup label="STYLE" options={S_OPTS} selected={f.style} onChange={function(v){set("style",v)}} />
      <ChkGroup label="KITCHEN" options={K_OPTS} selected={f.kitchen} onChange={function(v){set("kitchen",v)}} />
      <ChkGroup label="BEDROOMS" options={BED_OPTS} selected={f.bed} onChange={function(v){set("bed",v)}} />
      <ChkGroup label="BATHROOMS" options={BATH_OPTS} selected={f.bath} onChange={function(v){set("bath",v)}} />
      <ChkGroup label="PARKING" options={P_OPTS} selected={f.parking} onChange={function(v){set("parking",v)}} />
      <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid "+C.cardBorder}}>
        <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:f.toured?"#28a745":C.textMuted,marginBottom:6}}><input type="checkbox" checked={f.toured} onChange={function(e){set("toured",e.target.checked)}} /> Toured Only</label>
        <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:f.momPick?"#e91e9c":C.textMuted}}><input type="checkbox" checked={f.momPick} onChange={function(e){set("momPick",e.target.checked)}} /> Mom's Picks</label>
      </div>
    </div>
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
  var onSelectHome = props.onSelectHome;
  var focusRef = props.focusRef;
  var _s = useState(false); var open = _s[0]; var setOpen = _s[1];
  var _ready = useState(false); var ready = _ready[0]; var setReady = _ready[1];
  var mapRef = React.useRef(null);
  var mapInstance = React.useRef(null);
  var markersRef = React.useRef([]);
  var routesRef = React.useRef([]);
  var infoRef = React.useRef(null);
  var geocacheRef = React.useRef({});
  var workMarkerRef = React.useRef(null);
  var hasFitRef = React.useRef(false);
  var homesRef = React.useRef(homes);
  var prevHomesLen = React.useRef(0);
  homesRef.current = homes;

  // Wire up global click handler for info window address links
  useEffect(function() {
    window._hshqSelect = function(id) {
      if (onSelectHome) onSelectHome(id);
    };
    return function() { delete window._hshqSelect; };
  }, [onSelectHome]);

  // Expose focus function via ref
  useEffect(function() {
    if (focusRef) {
      focusRef.current = function(home) {
        setOpen(true);
        // Wait for map to init, then center on the home
        setTimeout(function() {
          var fullAddr = home.address + ", " + (home.city || "Denver") + ", CO";
          var cached = geocacheRef.current[fullAddr];
          if (cached && mapInstance.current) {
            mapInstance.current.setCenter(cached);
            mapInstance.current.setZoom(15);
            // Open info window
            var gm = window.google.maps;
            if (infoRef.current) {
              var sc = ST_COLORS[autoStatus(home)] || "#6c757d";
              var photoHtml = home.photoUrl ? '<img src="' + home.photoUrl + '" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block" onerror="this.style.display=\'none\'" />' : '';
              var content = '<div style="font-family:Muli,sans-serif;color:#212529;max-width:240px;min-width:180px">' +
                photoHtml +
                '<strong style="font-size:13px;color:#55c278">' + home.address + '</strong><br>' +
                '<span style="font-size:12px;color:#6c757d">' + home.city + (home.neighborhood ? " · " + home.neighborhood : "") + '</span><br>' +
                '<span style="font-size:13px;font-weight:700;color:#55c278">$' + home.price.toLocaleString() + '</span>' +
                '<span style="font-size:11px;color:#888"> · ' + home.sqft + ' sqft</span>' +
                '</div>';
              infoRef.current.setContent(content);
              infoRef.current.setPosition(cached);
              infoRef.current.open(mapInstance.current);
            }
          } else if (mapInstance.current && window.google) {
            // Geocode if not cached yet
            var geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ address: fullAddr }, function(results, status) {
              if (status === "OK" && results[0]) {
                var pos = results[0].geometry.location;
                geocacheRef.current[fullAddr] = pos;
                mapInstance.current.setCenter(pos);
                mapInstance.current.setZoom(15);
              }
            });
          }
        }, 500);
      };
    }
  });

  useEffect(function() {
    if (!open || !gmapsKey) return;
    loadGmapsScript(gmapsKey, function() { setReady(true); });
  }, [open, gmapsKey]);

  // Reset map when panel closes
  useEffect(function() {
    if (!open) {
      mapInstance.current = null;
      markersRef.current = [];
      routesRef.current = [];
      hasFitRef.current = false;
    }
  }, [open]);

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

    // Neighborhood highlight boundaries
    var neighborhoods = [
      {
        name: "North Park Hill",
        color: "#55c278",
        coords: [
          {lat:39.7612,lng:-104.9407},{lat:39.7612,lng:-104.9014},
          {lat:39.7388,lng:-104.9014},{lat:39.7388,lng:-104.9407}
        ]
      },
      {
        name: "South Park Hill",
        color: "#0d6efd",
        coords: [
          {lat:39.7388,lng:-104.9407},{lat:39.7388,lng:-104.9014},
          {lat:39.7197,lng:-104.9014},{lat:39.7197,lng:-104.9407}
        ]
      },
      {
        name: "Central Park",
        color: "#e91e9c",
        coords: [
          {lat:39.7751,lng:-104.9014},{lat:39.7751,lng:-104.8530},
          {lat:39.7388,lng:-104.8530},{lat:39.7388,lng:-104.9014}
        ]
      }
    ];

    neighborhoods.forEach(function(n) {
      var poly = new gm.Polygon({
        paths: n.coords,
        strokeColor: n.color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: n.color,
        fillOpacity: 0.12,
        map: mapInstance.current,
        zIndex: 1
      });
      var labelPos = {
        lat: n.coords.reduce(function(s,c){return s+c.lat},0)/n.coords.length,
        lng: n.coords.reduce(function(s,c){return s+c.lng},0)/n.coords.length
      };
      new gm.Marker({
        position: labelPos,
        map: mapInstance.current,
        icon: {path:"M0 0",scale:0},
        label: {text:n.name,color:n.color,fontSize:"11px",fontWeight:"700",fontFamily:"Muli,sans-serif"},
        zIndex: 2
      });
    });
  }, [ready, open]);

  useEffect(function() {
    if (!ready || !open || !mapInstance.current) return;
    var gm = window.google.maps;
    var map = mapInstance.current;
    for (var i = 0; i < markersRef.current.length; i++) markersRef.current[i].remove();
    markersRef.current = [];
    for (var j = 0; j < routesRef.current.length; j++) routesRef.current[j].setMap(null);
    routesRef.current = [];
    var geocoder = new gm.Geocoder();
    var directionsService = new gm.DirectionsService();
    var bounds = new gm.LatLngBounds();
    bounds.extend(WORK_COORDS);

    homesRef.current.forEach(function(h) {
      var fullAddr = h.address + ", " + (h.city || "Denver") + ", CO";
      var cached = geocacheRef.current[fullAddr];

      function placeMarker(pos) {
        var sc = ST_COLORS[autoStatus(h)] || "#6c757d";
        var priceLabel = "$" + Math.round(h.price / 1000) + "k";

        // Create custom bubble marker using OverlayView
        function BubbleMarker(position, map, label, color, home) {
          this.position = position;
          this.label = label;
          this.color = color;
          this.home = home;
          this.div = null;
          this.setMap(map);
        }
        BubbleMarker.prototype = new gm.OverlayView();
        BubbleMarker.prototype.onAdd = function() {
          var div = document.createElement("div");
          div.style.position = "absolute";
          div.style.background = this.color;
          div.style.color = "#fff";
          div.style.padding = "4px 10px";
          div.style.borderRadius = "20px";
          div.style.fontSize = "11px";
          div.style.fontWeight = "700";
          div.style.fontFamily = "Muli, sans-serif";
          div.style.whiteSpace = "nowrap";
          div.style.cursor = "pointer";
          div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
          div.style.border = "2px solid #fff";
          div.style.textAlign = "center";
          div.style.lineHeight = "1.2";
          div.style.zIndex = autoStatus(this.home) === "Excellent" || autoStatus(this.home) === "Good" ? "100" : autoStatus(this.home) === "Out" ? "1" : "50";
          div.style.transition = "transform 0.15s ease";
          div.textContent = this.label;
          var self = this;
          div.addEventListener("mouseover", function() { div.style.transform = "scale(1.15)"; div.style.zIndex = "200"; });
          div.addEventListener("mouseout", function() { div.style.transform = "scale(1)"; div.style.zIndex = autoStatus(self.home) === "Excellent" || autoStatus(self.home) === "Good" ? "100" : autoStatus(self.home) === "Out" ? "1" : "50"; });
          div.addEventListener("click", function() {
            var hh = self.home;
            var photoHtml = hh.photoUrl ? '<img src="' + hh.photoUrl + '" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block" onerror="this.style.display=\'none\'" />' : '';
            var content = '<div style="font-family:Muli,sans-serif;color:#212529;max-width:240px;min-width:180px">' +
              photoHtml +
              '<a href="#" onclick="window._hshqSelect(\'' + hh.id + '\');return false;" style="font-size:13px;font-weight:700;color:#55c278;text-decoration:none;cursor:pointer;display:block;margin-bottom:2px">' + hh.address + '</a>' +
              '<span style="font-size:12px;color:#6c757d">' + hh.city + (hh.neighborhood ? " · " + hh.neighborhood : "") + '</span><br>' +
              '<span style="font-size:13px;font-weight:700;color:#55c278">$' + hh.price.toLocaleString() + '</span>' +
              '<span style="font-size:11px;color:#888"> · ' + hh.sqft + ' sqft</span><br>' +
              '<span style="font-size:11px;color:#888">' + hh.bed + ' bed · ' + hh.bath + ' bath · ' + hh.style + '</span>' +
              (hh.commute != null ? '<br><span style="font-size:11px;color:#0d6efd">🚗 ' + hh.commute + ' min</span>' : '') +
              '<br><span style="display:inline-block;margin-top:4px;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:' + self.color + '22;color:' + self.color + '">' + autoStatus(hh) + '</span>' +
              '</div>';
            infoRef.current.setContent(content);
            infoRef.current.setPosition(self.position);
            infoRef.current.open(map);
          });
          this.div = div;
          var panes = this.getPanes();
          panes.overlayMouseTarget.appendChild(div);
        };
        BubbleMarker.prototype.draw = function() {
          var proj = this.getProjection();
          var point = proj.fromLatLngToDivPixel(this.position);
          if (this.div) {
            this.div.style.left = (point.x - this.div.offsetWidth / 2) + "px";
            this.div.style.top = (point.y - this.div.offsetHeight / 2) + "px";
          }
        };
        BubbleMarker.prototype.onRemove = function() {
          if (this.div) { this.div.parentNode.removeChild(this.div); this.div = null; }
        };
        BubbleMarker.prototype.remove = function() { this.setMap(null); };

        var bubble = new BubbleMarker(pos, map, priceLabel, sc, h);
        markersRef.current.push(bubble);
        bounds.extend(pos);
        if (!hasFitRef.current) {
          map.fitBounds(bounds, 40);
        }

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
    hasFitRef.current = true;
  }, [ready, open]);

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


/* ─── Home Card (Compact Box) ─── */
function HomeCard(props) {
  var h = props.home, u = props.onUpdate, del = props.onDelete, ex = props.expanded, tog = props.onToggle, cfg = props.cfg, canEdit = props.canEdit, onMap = props.onShowOnMap;
  var dp = calcDown(h.price, cfg);
  var highDown = (h.price * (cfg.downPct / 100)) > cfg.maxDown;
  var ln = h.price - dp;
  var m30 = calcPmt(cfg.rate30, cfg.term30, ln);
  var m15 = calcPmt(cfg.rate15, cfg.term15, ln);
  var ins = (cfg.insPct / 100) * h.price / 12;
  var tax = (cfg.taxPct / 100) * h.price / 12;
  var tot30 = m30 + (h.hoa || 0) + ins + tax;
  var tot15 = m15 + (h.hoa || 0) + ins + tax;
  var mR = h.michelleRating, pR = h.peterRating;
  var tR = (mR != null || pR != null) ? (mR || 0) + (pR || 0) : null;
  var computedStatus = autoStatus(h);
  var sc = ST_COLORS[computedStatus] || ST_COLORS.Waiting;
  var ppsf = h.sqft ? (h.price / h.sqft).toFixed(0) : "—";

  var addrContent = h.link
    ? <a href={h.link} target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"none",borderBottom:"1px solid "+C.primary+"55",paddingBottom:1}}>{h.address}</a>
    : h.address;

  return (
    <div id={"home-card-" + h.id} style={{background:C.card,borderRadius:12,border:"1px solid "+(ex?C.primary+"66":C.cardBorder),overflow:"hidden",boxShadow:ex?"0 2px 12px #55c27822":"0 1px 4px #0001",transition:"all 0.2s ease",cursor:"pointer",height:"100%",display:"flex",flexDirection:"column",maxWidth:"100%"}} onClick={function(e){if(e.target.tagName!=="INPUT"&&e.target.tagName!=="SELECT"&&e.target.tagName!=="BUTTON"&&e.target.tagName!=="A"&&!e.target.closest("button")&&!e.target.closest("a")&&!e.target.closest("label"))tog(h.id)}}>
      <div style={{height:3,background:sc}} />
      {/* Photo left + info right */}
      <div className="hshq-card-inner" style={{display:"flex",flex:1}}>
        {h.photoUrl && <div className="hshq-card-photo" style={{width:ex?280:90,flexShrink:0,background:C.inputBg,alignSelf:"stretch",position:"relative",minHeight:80,overflow:"hidden",transition:"width 0.3s ease"}}>
          <img src={h.photoUrl} alt="" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center center",display:"block"}} onError={function(e){e.target.parentElement.style.display="none"}} />
        </div>}
        <div style={{padding:"8px 10px",flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:2}}>
            <span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:4,background:sc+"22",color:sc,fontFamily:"var(--body)"}}>{computedStatus}</span>
            {h.sold && <span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:4,background:"#dc354522",color:"#dc3545",fontFamily:"var(--body)"}}>SOLD</span>}
            {h.pending && <span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:4,background:"#fd7e1422",color:"#fd7e14",fontFamily:"var(--body)"}}>PENDING</span>}
            {h.tooExpensive && <span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:4,background:"#6f42c122",color:"#6f42c1",fontFamily:"var(--body)"}}>$$</span>}
            {highDown && <span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:4,background:"#e8390622",color:"#e83906",fontFamily:"var(--body)"}}>HIGH DOWN</span>}
            {h.momPick && <span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:4,background:"#e91e9c22",color:"#e91e9c",fontFamily:"var(--body)"}}>MOM</span>}
          </div>
          <h3 style={{margin:"0 0 1px",fontSize:11,fontFamily:"var(--head)",fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{addrContent}</h3>
          <div style={{fontSize:9,color:C.textMuted,fontFamily:"var(--body)",marginBottom:3}}>{h.city}{h.neighborhood ? " · "+h.neighborhood : ""}</div>
          <div style={{fontSize:15,fontWeight:800,color:C.primary,fontFamily:"var(--head)",lineHeight:1}}>${h.price.toLocaleString()}</div>
          <div style={{fontSize:9,color:C.textMuted,fontFamily:"var(--body)",marginBottom:3}}>{h.sqft.toLocaleString()}sf · {h.bed}bd/{h.bath}ba · ${fmtNum(tot30)}/mo</div>
          <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
            <RatingBar label="M" value={mR} color="#e83e8c" />
            <RatingBar label="P" value={pR} color={C.primary} />
            {tR != null && <span style={{fontSize:9,fontWeight:700,color:C.text,background:C.inputBg,padding:"0px 4px",borderRadius:4}}>{"Σ"+tR+((mR==null||pR==null)?"*":"")}</span>}
            {h.commute != null && <span style={{fontSize:9,color:"#0d6efd",fontWeight:600}}>🚗{h.commute}m</span>}
            {onMap && <button onClick={function(e){e.stopPropagation();onMap(h)}} style={{marginLeft:"auto",background:"none",border:"none",color:"#0d6efd",cursor:"pointer",fontSize:9,fontFamily:"var(--body)",padding:"1px 0"}}>📍</button>}
          </div>
        </div>
      </div>
      {ex && <div className="card-expand" style={{borderTop:"1px solid "+C.cardBorder,padding:"10px 12px",background:C.inputBg,maxWidth:"100%",overflowX:"hidden"}} onClick={function(e){e.stopPropagation()}}>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:C.textMuted,fontFamily:"var(--body)",marginBottom:12}}>
          <span>Kitchen <strong style={{color:C.text}}>{h.kitchen}</strong></span>
          <span>Parking <strong style={{color:C.text}}>{h.parking}</strong></span>
          <span>HOA <strong style={{color:h.hoa>400?"#dc3545":C.text}}>{h.hoa>0?"$"+h.hoa:"—"}</strong></span>
          <span>15yr <strong style={{color:C.text}}>${fmtNum(tot15)}/mo</strong></span>
          <span>30yr <strong style={{color:C.primary}}>${fmtNum(tot30)}/mo</strong></span>
          <span>Down <strong style={{color:C.text}}>${fmtNum(dp)}</strong></span>
          <span>Loan <strong style={{color:C.text}}>${ln.toLocaleString()}</strong></span>
          {h.tourStatus && <span>Tour <strong style={{color:"#28a745"}}>✓ Toured</strong></span>}
          {h.notes && <span style={{fontStyle:"italic"}}>{h.notes}</span>}
        </div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:C.textMuted,fontFamily:"var(--body)",marginBottom:12,paddingBottom:12,borderBottom:"1px solid "+C.cardBorder}}>
          <span>15yr P&I: <strong style={{color:C.text}}>${fmtNum(m15)}/mo</strong></span>
          <span>30yr P&I: <strong style={{color:C.primary}}>${fmtNum(m30)}/mo</strong></span>
          <span>Ins: <strong style={{color:C.text}}>${fmtNum(ins)}/mo</strong></span>
          <span>Tax: <strong style={{color:C.text}}>${fmtNum(tax)}/mo</strong></span>
        </div>
        {canEdit && <div className="hshq-edit-grid">
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
          <div>
            <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",display:"block",marginBottom:3}}>MARKET STATUS</label>
            <div style={{display:"flex",gap:10,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
              <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:h.sold?"#dc3545":C.text}}><input type="checkbox" checked={!!h.sold} onChange={function(e){u(h.id,"sold",e.target.checked);if(e.target.checked){u(h.id,"pending",false);u(h.id,"tooExpensive",false)}}} /> Sold</label>
              <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:h.pending?"#fd7e14":C.text}}><input type="checkbox" checked={!!h.pending} onChange={function(e){u(h.id,"pending",e.target.checked);if(e.target.checked){u(h.id,"sold",false);u(h.id,"tooExpensive",false)}}} /> Pending</label>
              <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:h.tooExpensive?"#6f42c1":C.text}}><input type="checkbox" checked={!!h.tooExpensive} onChange={function(e){u(h.id,"tooExpensive",e.target.checked);if(e.target.checked){u(h.id,"sold",false);u(h.id,"pending",false)}}} /> $$$</label>
              <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:h.momPick?"#e91e9c":C.text}}><input type="checkbox" checked={!!h.momPick} onChange={function(e){u(h.id,"momPick",e.target.checked)}} /> Mom's Pick</label>
            </div>
          </div>
          <div>
            <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",display:"block",marginBottom:3}}>AUTO RATING</label>
            <div style={{fontSize:13,fontWeight:700,color:sc,fontFamily:"var(--body)",marginTop:4}}>{computedStatus}</div>
          </div>
          <EF label="Listing Link" value={h.link||""} onChange={function(v){u(h.id,"link",v)}} />
          <div>
            <label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.05em",display:"block",marginBottom:3}}>TOURED</label>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:11,fontFamily:"var(--body)",color:h.tourStatus?"#28a745":C.text,marginTop:4}}>
              <input type="checkbox" checked={!!h.tourStatus} onChange={function(e){u(h.id,"tourStatus",e.target.checked?"Toured":"")}} />
              {h.tourStatus ? "Toured" : "Not yet"}
            </label>
          </div>
          <EF label="Michelle (/10)" value={h.michelleRating!=null?h.michelleRating:""} type="number" onChange={function(v){u(h.id,"michelleRating",v===""?null:parseFloat(v))}} />
          <EF label="Peter (/10)" value={h.peterRating!=null?h.peterRating:""} type="number" onChange={function(v){u(h.id,"peterRating",v===""?null:parseFloat(v))}} />
          <EF label="Photo URL" value={h.photoUrl||""} onChange={function(v){u(h.id,"photoUrl",v)}} />
          <EF label="Notes" value={h.notes||""} onChange={function(v){u(h.id,"notes",v)}} />
          <div style={{gridColumn:"1/-1",display:"flex",justifyContent:"flex-end",paddingTop:8}}>
            <button onClick={function(e){e.stopPropagation();if(window.confirm("Are you sure you want to delete this listing?\n\n"+h.address))del(h.id)}} style={{background:"#dc354511",color:"#dc3545",border:"1px solid #dc354533",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:12,fontFamily:"var(--body)",fontWeight:600}}>DELETE</button>
          </div>
        </div>}
        {!canEdit && <div className="hshq-edit-grid">
          <div><label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,display:"block",marginBottom:3}}>ADDRESS</label><div style={{fontSize:13,color:C.text,fontFamily:"var(--body)"}}>{h.address}</div></div>
          <div><label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,display:"block",marginBottom:3}}>CITY</label><div style={{fontSize:13,color:C.text,fontFamily:"var(--body)"}}>{h.city}</div></div>
          <div><label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,display:"block",marginBottom:3}}>NEIGHBORHOOD</label><div style={{fontSize:13,color:C.text,fontFamily:"var(--body)"}}>{h.neighborhood||"—"}</div></div>
          <div><label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,display:"block",marginBottom:3}}>PRICE</label><div style={{fontSize:13,color:C.text,fontFamily:"var(--body)"}}>${h.price.toLocaleString()}</div></div>
          <div><label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,display:"block",marginBottom:3}}>SQ FT</label><div style={{fontSize:13,color:C.text,fontFamily:"var(--body)"}}>{h.sqft.toLocaleString()}</div></div>
          <div><label style={{fontSize:10,color:C.textMuted,fontFamily:"var(--body)",fontWeight:600,display:"block",marginBottom:3}}>DOWN PMT</label><div style={{fontSize:13,color:C.text,fontFamily:"var(--body)"}}>${fmtNum(dp)}</div></div>
        </div>}
      </div>}
    </div>
  );
}
/* ─── Edit Mode Login Modal ─── */
function EditLoginModal(props) {
  var _p = useState(""); var pw = _p[0]; var setPw = _p[1];
  var _err = useState(""); var err = _err[0]; var setErr = _err[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

  function go() {
    if (!pw) return;
    setLoading(true); setErr("");
    signInWithEmailAndPassword(auth, AUTH_EMAIL, pw)
      .then(function() { props.onSuccess(); })
      .catch(function() { setErr("Incorrect passcode"); setLoading(false); });
  }

  return (
    <div style={{position:"fixed",inset:0,background:"#00000066",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}} onClick={props.onClose}>
      <div style={{background:C.card,borderRadius:16,padding:32,width:"90%",maxWidth:360,border:"1px solid "+C.cardBorder,textAlign:"center",boxShadow:"0 8px 32px #0002"}} onClick={function(e){e.stopPropagation()}}>
        <div style={{width:48,height:48,borderRadius:12,background:C.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 14px",color:"#fff"}}>✏️</div>
        <h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:C.text,fontFamily:"var(--head)"}}>Edit Mode</h2>
        <p style={{margin:"0 0 18px",fontSize:12,color:C.textMuted,fontFamily:"var(--body)"}}>Enter passcode to unlock editing</p>
        <input type="password" value={pw} onChange={function(e){setPw(e.target.value)}} onKeyDown={function(e){if(e.key==="Enter")go()}} placeholder="Passcode"
          style={{width:"100%",background:C.inputBg,border:"1px solid " + (err ? "#dc3545" : C.inputBorder),borderRadius:10,padding:"12px 16px",color:C.text,fontSize:15,fontFamily:"var(--body)",textAlign:"center",marginBottom:12,outline:"none"}} />
        {err && <p style={{margin:"0 0 10px",fontSize:12,color:"#dc3545",fontFamily:"var(--body)"}}>{err}</p>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={props.onClose} style={{flex:1,background:C.inputBg,color:C.textMuted,border:"1px solid "+C.cardBorder,borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontFamily:"var(--body)",fontWeight:600}}>Cancel</button>
          <button onClick={go} disabled={loading} style={{flex:1,background:loading?C.cardBorder:C.primary,color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontFamily:"var(--body)",fontWeight:700}}>{loading ? "..." : "Unlock"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard ─── */
function Dashboard(props) {
  var canEdit = props.canEdit;
  var onAuth = props.onAuth;
  var _h = useState([]); var homes = _h[0]; var setHomes = _h[1];
  var _ex = useState(null); var exId = _ex[0]; var setExId = _ex[1];
  var _m = useState(null); var modal = _m[0]; var setModal = _m[1];
  var _so = useState("price"); var sortBy = _so[0]; var setSortBy = _so[1];
  var _cd = useState("asc"); var sortDir = _cd[0]; var setSortDir = _cd[1];
  var _sr = useState(""); var search = _sr[0]; var setSearch = _sr[1];
  var _cfg = useState(DEFAULT_CFG); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _fi = useState({status:[],style:[],kitchen:[],bed:[],bath:[],parking:[],toured:false,momPick:false});
  var filters = _fi[0]; var setFilters = _fi[1];
  var _showLogin = useState(false); var showLogin = _showLogin[0]; var setShowLogin = _showLogin[1];
  var mapFocusRef = React.useRef(null);
  var mapPanelRef = React.useRef(null);
  var _comDay = useState("1"); var comDay = _comDay[0]; var setComDay = _comDay[1]; // 0=Sun, 1=Mon...
  var _comTime = useState("08:00"); var comTime = _comTime[0]; var setComTime = _comTime[1];
  var _comLoading = useState(false); var comLoading = _comLoading[0]; var setComLoading = _comLoading[1];
  var _comProgress = useState(""); var comProgress = _comProgress[0]; var setComProgress = _comProgress[1];

  function getNextDepartureTimestamp(dayOfWeek, timeStr) {
    // dayOfWeek: 0=Sun, 1=Mon... timeStr: "08:00"
    var parts = timeStr.split(":");
    var hrs = parseInt(parts[0]); var mins = parseInt(parts[1]) || 0;
    var now = new Date();
    var target = new Date(now);
    var diff = (parseInt(dayOfWeek) - now.getDay() + 7) % 7;
    if (diff === 0 && (now.getHours() > hrs || (now.getHours() === hrs && now.getMinutes() >= mins))) diff = 7;
    target.setDate(now.getDate() + diff);
    target.setHours(hrs, mins, 0, 0);
    return Math.floor(target.getTime() / 1000);
  }

  async function recalcAllCommutes() {
    setComLoading(true);
    var ts = getNextDepartureTimestamp(comDay, comTime);
    var count = 0;
    for (var i = 0; i < homes.length; i++) {
      var h = homes[i];
      setComProgress((i + 1) + "/" + homes.length + " — " + h.address);
      try {
        // Try with departure time first, fall back to without
        var mins = await doFetchCommute(h.address, h.city, ts);
        if (mins == null) {
          mins = await doFetchCommute(h.address, h.city, null);
        }
        console.log(h.address, "→", mins, "min");
        if (mins != null) {
          await updateDoc(doc(db, "homes", h.id), { commute: mins });
          count++;
        }
      } catch (err) {
        console.error("Commute error for", h.address, err);
      }
    }
    setComProgress("Done! Updated " + count + " of " + homes.length);
    setComLoading(false);
    setTimeout(function() { setComProgress(""); }, 3000);
  }

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
  function add(h) { h.addedAt = new Date().toISOString(); addDoc(collection(db, "homes"), h); }
  function doSignOut() { signOut(auth); }

  function matchBed(h, sel) { if(!sel.length) return true; for(var i=0;i<sel.length;i++){if(sel[i]==="4+"&&h.bed>=4)return true;if(h.bed===parseFloat(sel[i]))return true} return false; }
  function matchBath(h, sel) { if(!sel.length) return true; for(var i=0;i<sel.length;i++){if(sel[i]==="3+"&&h.bath>=3)return true;if(h.bath===parseFloat(sel[i]))return true} return false; }

  var filtered = useMemo(function() {
    var list = homes.slice();
    if (filters.status.length) list = list.filter(function(h){return filters.status.indexOf(autoStatus(h))>=0});
    if (filters.style.length) list = list.filter(function(h){return filters.style.indexOf(h.style)>=0});
    if (filters.kitchen.length) list = list.filter(function(h){return filters.kitchen.indexOf(h.kitchen)>=0});
    if (filters.parking.length) list = list.filter(function(h){return filters.parking.indexOf(h.parking)>=0});
    if (filters.bed.length) list = list.filter(function(h){return matchBed(h,filters.bed)});
    if (filters.bath.length) list = list.filter(function(h){return matchBath(h,filters.bath)});
    if (filters.toured) list = list.filter(function(h){return !!h.tourStatus});
    if (filters.momPick) list = list.filter(function(h){return !!h.momPick});
    if (search) { var t = search.toLowerCase(); list = list.filter(function(h){return h.address.toLowerCase().indexOf(t)>=0||h.city.toLowerCase().indexOf(t)>=0||(h.neighborhood||"").toLowerCase().indexOf(t)>=0||(h.notes||"").toLowerCase().indexOf(t)>=0}); }
    if (sortBy === "price") { list.sort(function(a,b){return sortDir==="asc"?a.price-b.price:b.price-a.price}); }
    else if (sortBy === "sqft") { list.sort(function(a,b){return sortDir==="asc"?a.sqft-b.sqft:b.sqft-a.sqft}); }
    else if (sortBy === "rating") { list.sort(function(a,b){ function r(h){var x=[];if(h.michelleRating!=null)x.push(h.michelleRating);if(h.peterRating!=null)x.push(h.peterRating);var s=0;for(var i=0;i<x.length;i++)s+=x[i];return x.length?s:-1} return sortDir==="asc"?r(a)-r(b):r(b)-r(a) }); }
    else if (sortBy === "monthly") { list.sort(function(a,b){ function t(h){var d=calcDown(h.price,cfg);return calcPmt(cfg.rate30,cfg.term30,h.price-d)+(h.hoa||0)+(cfg.insPct/100)*h.price/12+(cfg.taxPct/100)*h.price/12} return sortDir==="asc"?t(a)-t(b):t(b)-t(a) }); }
    else if (sortBy === "added") { list.sort(function(a,b){ var ta = a.addedAt||a.added||""; var tb = b.addedAt||b.added||""; return sortDir==="asc"?ta.localeCompare(tb):tb.localeCompare(ta) }); }
    else if (sortBy === "commute") { if(sortDir==="asc") list.sort(function(a,b){return (a.commute||999)-(b.commute||999)}); else list.sort(function(a,b){return (b.commute||-1)-(a.commute||-1)}); }
    return list;
  }, [homes, filters, search, sortBy, cfg, sortDir]);

  var activeCount = homes.filter(function(h){return autoStatus(h)!=="Out"}).length;
  var touredCount = homes.filter(function(h){return h.tourStatus && h.tourStatus.indexOf("Toured")>=0}).length;
  var activeHomes = homes.filter(function(h){return autoStatus(h)!=="Out"});
  var avgPrice = activeHomes.length ? activeHomes.reduce(function(s,h){return s+h.price},0)/activeHomes.length : 0;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"var(--body)",color:C.text}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@500;700&family=Muli:wght@400;700;800&display=swap');:root{--head:'Saira Extra Condensed',sans-serif;--body:'Muli',sans-serif}*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.primaryLight};border-radius:3px}input:focus,select:focus{border-color:${C.primary}!important}@media(min-width:1600px){.hshq-scale{zoom:1.25}}@media(min-width:2200px){.hshq-scale{zoom:1.4}}@keyframes slideDown{from{max-height:0;opacity:0}to{max-height:800px;opacity:1}}.card-expand{animation:slideDown 0.3s ease-out forwards;overflow:hidden}.hshq-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.hshq-edit-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}@media(max-width:1200px){.hshq-cards{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.hshq-cards{grid-template-columns:repeat(2,1fr)}.hshq-sidebar{display:none!important}.hshq-mobile-filters{display:block!important}.hshq-layout{flex-direction:column!important}.hshq-main{width:100%!important}.hshq-edit-grid{grid-template-columns:1fr 1fr}.hshq-expanded-wrap{grid-column:auto!important}}@media(max-width:500px){.hshq-cards{grid-template-columns:repeat(2,1fr);gap:6px}.hshq-edit-grid{grid-template-columns:1fr}.hshq-expanded-wrap{grid-column:1/-1!important}.hshq-card-inner{flex-direction:column!important}.hshq-card-photo{width:100%!important;height:80px!important;min-height:80px!important}}`}</style>

      <div className="hshq-scale">
      {/* Green Header Banner */}
      <div style={{background:C.primary,padding:"24px 20px 20px",marginBottom:0}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",alignItems:"center",gap:12}}>
          <a href="https://huynh.place" style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"6px 14px",color:"#fff",cursor:"pointer",fontSize:11,fontFamily:"var(--body)",textDecoration:"none",fontWeight:600,whiteSpace:"nowrap"}}>← Main</a>
          <div style={{width:40,height:40,borderRadius:10,background:"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🏠</div>
          <div style={{flex:1}}>
            <h1 style={{margin:0,fontSize:30,fontWeight:700,letterSpacing:"-0.01em",color:"#fff",fontFamily:"var(--head)"}}>Home Search HQ</h1>
            <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,0.8)",fontFamily:"var(--body)"}}>Peter & Michelle · Denver Metro · {homes.length} properties</p>
          </div>
          {canEdit ? <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:"var(--body)"}}>✏️ Edit Mode</span>
            <button onClick={doSignOut} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"6px 14px",color:"#fff",cursor:"pointer",fontSize:11,fontFamily:"var(--body)"}}>Lock</button>
          </div> : <button onClick={function(){setShowLogin(true)}} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"6px 14px",color:"#fff",cursor:"pointer",fontSize:11,fontFamily:"var(--body)"}}>🔓 Edit Mode</button>}
        </div>
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"20px 20px 28px"}}>

        <MortgageBar cfg={cfg} onChange={setCfg} />

        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.textMuted,fontFamily:"var(--body)",marginBottom:10,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{color:"#0d6efd"}}>📍</span> Commute to: <span style={{color:"#0d6efd"}}>{WORK_ADDRESS}</span>
            {canEdit && <span style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <select value={comDay} onChange={function(e){setComDay(e.target.value)}} style={{background:C.card,border:"1px solid "+C.inputBorder,borderRadius:6,padding:"4px 6px",color:C.text,fontSize:11,fontFamily:"var(--body)",outline:"none",cursor:"pointer"}}>
                <option value="1">Mon</option><option value="2">Tue</option><option value="3">Wed</option>
                <option value="4">Thu</option><option value="5">Fri</option><option value="6">Sat</option><option value="0">Sun</option>
              </select>
              <input type="time" value={comTime} onChange={function(e){setComTime(e.target.value)}} style={{background:C.card,border:"1px solid "+C.inputBorder,borderRadius:6,padding:"4px 6px",color:C.text,fontSize:11,fontFamily:"var(--body)",outline:"none"}} />
              <button onClick={recalcAllCommutes} disabled={comLoading} style={{background:comLoading?"#ccc":C.primary,color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:comLoading?"not-allowed":"pointer",fontSize:11,fontFamily:"var(--body)",fontWeight:600,whiteSpace:"nowrap"}}>
                {comLoading ? "⏳ Calculating..." : "🔄 Recalc Commutes"}
              </button>
              {comProgress && <span style={{fontSize:10,color:"#0d6efd",fontFamily:"var(--body)"}}>{comProgress}</span>}
            </span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
            {[["Total",homes.length],["Active",activeCount],["Toured",touredCount],["Avg Price","$"+Math.round(avgPrice/1000)+"k"]].map(function(item){
              return <div key={item[0]} style={{background:C.primary,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:"var(--body)",fontWeight:600,letterSpacing:"0.06em",marginBottom:4}}>{item[0].toUpperCase()}</div>
                <div style={{fontSize:24,fontWeight:700,color:"#fff",fontFamily:"var(--head)"}}>{item[1]}</div>
              </div>
            })}
          </div>
        </div>

        <div ref={mapPanelRef}>
        <MapPanel homes={filtered} gmapsKey={GMAPS_CLIENT_KEY} focusRef={mapFocusRef} onSelectHome={function(id){
          setExId(id);
          setTimeout(function(){
            var el = document.getElementById("home-card-" + id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        }} />
        </div>

        {/* Sidebar + Main Content */}
        <div className="hshq-layout" style={{display:"flex",gap:18,alignItems:"flex-start"}}>

          {/* Sticky Sidebar Filters - hidden on mobile */}
          <div className="hshq-sidebar" style={{width:220,flexShrink:0,position:"sticky",top:20,maxHeight:"calc(100vh - 40px)",overflowY:"auto"}}>
            <SidebarFilters filters={filters} onChange={setFilters} />
          </div>

          {/* Main Content */}
          <div className="hshq-main" style={{flex:1,minWidth:0}}>
            {/* Mobile Filters - shown only on mobile */}
            <div className="hshq-mobile-filters" style={{display:"none",marginBottom:12}}>
              <FilterPanel filters={filters} onChange={setFilters} />
            </div>
            <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
          <input type="text" placeholder="Search address, city, notes..." value={search} onChange={function(e){setSearch(e.target.value)}}
            style={{flex:"1 1 180px",background:C.card,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:"var(--body)",outline:"none",minWidth:160}} />
          <select value={sortBy} onChange={function(e){var v=e.target.value;setSortBy(v);setSortDir(v==="rating"||v==="added"||v==="sqft"?"desc":"asc")}} style={{background:C.card,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,fontFamily:"var(--body)",outline:"none",cursor:"pointer"}}>
            <option value="price">Price</option>
            <option value="sqft">Sq Ft</option>
            <option value="rating">Rating</option>
            <option value="monthly">Monthly</option>
            <option value="added">Recent</option>
            <option value="commute">Commute</option>
          </select>
          <button onClick={function(){setSortDir(function(d){return d==="asc"?"desc":"asc"})}} style={{background:C.card,color:"#0d6efd",border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 12px",cursor:"pointer",fontSize:12,fontFamily:"var(--body)",fontWeight:600,whiteSpace:"nowrap"}}>{
            sortBy==="price" ? (sortDir==="asc"?"↑ Cheapest":"↓ Priciest") :
            sortBy==="sqft" ? (sortDir==="asc"?"↑ Smallest":"↓ Largest") :
            sortBy==="rating" ? (sortDir==="asc"?"↑ Worst":"↓ Best") :
            sortBy==="monthly" ? (sortDir==="asc"?"↑ Cheapest":"↓ Priciest") :
            sortBy==="added" ? (sortDir==="asc"?"↑ Oldest":"↓ Newest") :
            sortBy==="commute" ? (sortDir==="asc"?"↑ Nearest":"↓ Farthest") : ""
          }</button>
          {canEdit && <button onClick={function(){setModal("url")}} style={{background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:700,whiteSpace:"nowrap"}}>🔗 PASTE LINK</button>}
          {canEdit && <button onClick={function(){setModal("manual")}} style={{background:C.card,color:C.text,border:"1px solid "+C.inputBorder,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13,fontFamily:"var(--body)",fontWeight:600,whiteSpace:"nowrap"}}>+ MANUAL</button>}
        </div>

        <div style={{fontSize:12,color:C.textMuted,fontFamily:"var(--body)",marginBottom:12}}>Showing {filtered.length} of {homes.length}</div>

        <div className="hshq-cards">
          {filtered.map(function(h) {
            var isExpanded = exId===h.id;
            return <div key={h.id} className={isExpanded?"hshq-expanded-wrap":""} style={isExpanded?{gridColumn:"1/-1"}:{}}>
              <HomeCard home={h} onUpdate={upd} onDelete={del} expanded={isExpanded} onToggle={function(id){setExId(function(p){return p===id?null:id})}} cfg={cfg} canEdit={canEdit} onShowOnMap={function(home){
              if (mapPanelRef.current) mapPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
              setTimeout(function(){
                if (mapFocusRef.current) mapFocusRef.current(home);
              }, 300);
            }} />
            </div>;
          })}
        </div>

        {filtered.length === 0 && <div style={{textAlign:"center",padding:60,color:C.textMuted}}>
          <div style={{fontSize:40,marginBottom:12}}>🔍</div>
          <div style={{fontSize:14,fontFamily:"var(--body)"}}>No homes match your filters</div>
        </div>}
          </div>{/* end main content */}
        </div>{/* end sidebar+main flex */}
      </div>
      </div>{/* end hshq-scale */}
      {modal === "url" && <UrlModal onAdd={add} onClose={function(){setModal(null)}} cfg={cfg} />}
      {modal === "manual" && <ManualModal onAdd={add} onClose={function(){setModal(null)}} />}
      {showLogin && <EditLoginModal onSuccess={function(){setShowLogin(false)}} onClose={function(){setShowLogin(false)}} />}
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
  return <Dashboard canEdit={authed} onAuth={setAuthed} />;
}
