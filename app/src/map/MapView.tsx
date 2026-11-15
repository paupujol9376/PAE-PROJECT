import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import maplibregl, { type GeoJSONSource, type Map as MLMap, type FilterSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildStyle, ROAD_CLASSES, ROAD_GROUPS, SRI_LANKA_BOUNDS, SRI_LANKA_FIT, type StyleOptions } from './style';
import { protocol, tileKeys } from '../offline/offline';
import { dataset, flyRequest, isMobile, lang, levelFilter, panelOpen, roadGroups, showBoundaries, showLabels, theme } from '../state';
import { navigate, route } from '../router';
import { toGeoJSON } from '../data/schools';
import { areaName, t, type Key } from '../i18n';

maplibregl.addProtocol('pmtiles', protocol.tile);

const BASE = import.meta.env.BASE_URL;
const PANEL_W = 340 + 24; // --panel-width + 2 × --panel-gutter

export function MapView() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keys = tileKeys.peek();
    if (!el.current || !keys) return;
    // Only theme and tile keys are subscribed here; visibility toggles are applied in place
    // (stopVis), so they are peeked to avoid rebuilding the whole style.
    const opts = (): StyleOptions => ({
      theme: theme.value, roadsKey: tileKeys.value!.roads, baseKey: tileKeys.value!.base,
      dataUrl: `${BASE}data/`, glyphs: `${location.origin}${BASE}glyphs/{fontstack}/{range}.pbf`,
      roadGroups: roadGroups.peek(), boundaries: showBoundaries.peek(), labels: showLabels.peek(),
    });
    const map: MLMap = new maplibregl.Map({
      container: el.current,
      style: buildStyle(opts()),
      bounds: SRI_LANKA_FIT,
      maxBounds: SRI_LANKA_BOUNDS,
      minZoom: 6,
      maxZoom: 17,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      fitBoundsOptions: { padding: 24 },
    });
    map.touchZoomRotate.disableRotation();
    const cleanups: (() => void)[] = [];
    (window as unknown as { __map: MLMap }).__map = map; // for e2e tests

    // --- helpers that (re)apply runtime state to the current style ---
    const setSchools = () => {
      const ds = dataset.value;
      const src = map.getSource('schools') as GeoJSONSource | undefined;
      if (ds && src) src.setData(toGeoJSON(ds.schools));
    };
    const applyFilter = () => {
      const lv = [...levelFilter.value];
      if (map.getLayer('schools')) map.setFilter('schools', lv.length ? (['in', ['get', 'level'], ['literal', lv]] as FilterSpecification) : null);
    };
    const applySelection = () => {
      const r = route.value;
      if (map.getLayer('schools-selected')) map.setFilter('schools-selected', ['==', ['get', 'id'], r.name === 'school' ? r.id : '']);
    };
    const applyAll = () => { setSchools(); applyFilter(); applySelection(); };
    map.on('load', applyAll);

    // --- theme or tile source change: rebuild the style, then restore runtime data ---
    let first = true;
    const stopStyle = effect(() => {
      const o = opts();
      if (first) { first = false; return; }
      map.setStyle(buildStyle(o), { diff: false });
      map.once('style.load', applyAll);
    });
    // visibility toggles without a style rebuild
    const stopVis = effect(() => {
      const groups = roadGroups.value, b = showBoundaries.value, l = showLabels.value;
      if (!map.isStyleLoaded()) return;
      const set = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      for (const r of ROAD_CLASSES) {
        const on = groups.has(Object.keys(ROAD_GROUPS).find((g) => ROAD_GROUPS[g].includes(r.cls))!);
        set(`roads-${r.cls}`, on);
        set(`roads-glow-${r.cls}`, on);
      }
      set('roads-core-highlight', groups.has('major'));
      set('admin-district', b); set('admin-province', b);
      set('roads-label', l); set('place-label', l);
    });
    const stopData = effect(() => { dataset.value; if (map.isStyleLoaded()) setSchools(); });
    const stopFilter = effect(() => { levelFilter.value; if (map.isStyleLoaded()) applyFilter(); });
    const stopSel = effect(() => { route.value; if (map.isStyleLoaded()) applySelection(); });
    // keep the island visible next to the docked panel
    const stopPad = effect(() => {
      map.setPadding({ left: !isMobile.value && panelOpen.value ? PANEL_W : 0, top: 0, right: 0, bottom: isMobile.value ? Math.round(innerHeight * 0.4) : 0 });
    });
    const stopFly = effect(() => {
      const f = flyRequest.value;
      if (!f) return;
      if (f.bbox) map.fitBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], { padding: 40, maxZoom: 13, duration: 900 });
      else if (f.center) map.flyTo({ center: f.center, zoom: Math.max(map.getZoom(), f.zoom ?? 14), duration: 900 });
    });

    // --- popup card for the selected school (desktop; on mobile the sheet shows the details) ---
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 12, maxWidth: '260px' });
    const stopPopup = effect(() => {
      const r = route.value, ds = dataset.value;
      lang.value; // re-render text on language change
      const s = r.name === 'school' && ds ? ds.byId.get(r.id) : undefined;
      if (!s || isMobile.value) { popup.remove(); return; }
      const box = document.createElement('div');
      box.className = 'pop';
      const name = document.createElement('strong');
      name.textContent = s.name;
      const meta = document.createElement('span');
      meta.textContent = [t(`level.${s.level}` as Key), s.district && areaName(s.district)].filter(Boolean).join(' · ');
      const st = document.createElement('span');
      st.textContent = `${t('school.status')}: ${t(`status.${s.connectivity}` as Key)}`;
      box.append(name, meta, st);
      popup.setLngLat([s.lon, s.lat]).setDOMContent(box).addTo(map);
    });
    popup.on('close', () => { if (route.peek().name === 'school') navigate({ name: 'home' }); });
    cleanups.push(stopPopup, () => popup.remove());

    // --- interaction ---
    map.on('click', 'schools', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) navigate({ name: 'school', id });
    });
    map.on('mouseenter', 'schools', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'schools', () => (map.getCanvas().style.cursor = ''));
    map.on('idle', () => document.body.setAttribute('data-map-idle', '1'));
    map.on('movestart', () => document.body.removeAttribute('data-map-idle'));

    return () => { [stopStyle, stopVis, stopData, stopFilter, stopSel, stopPad, stopFly, ...cleanups].forEach((s) => s()); map.remove(); };
  }, []);

  return <div ref={el} class="map" role="region" aria-label={t('crumb.country')} />;
}
