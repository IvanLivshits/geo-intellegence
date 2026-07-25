import { Locale } from './locale';
import type { ActivityCategory, Band, MaskKey, MaskKind } from './constants';

export interface MemoStrings {
  backToMap: string;
  print: string;
  reportTitle: string;
  areaRadius: string;
  areaCustom: string;
  layersAssessed: string;
  schematicRadius: string;
  schematicCustom: string;
  conclusion: string;
  risksChecked: string;
  overallSuffix: string;
  plainSummary: string;
  forLending: string;
  mitigationTitle: string;
  modelled: string;
  assessed: string;
  mitigationNote: string;
  secRisk: string;
  thNum: string;
  thFactor: string;
  thValue: string;
  thRating: string;
  thVerdict: string;
  secNeighbourhood: string;
  thCategory: string;
  thCount: string;
  thNearest: string;
  thClosest: string;
  thWhy: string;
  licensing: string;
  secSources: string;
  thLayer: string;
  thDataset: string;
  thType: string;
  thLicence: string;
  poweredBy: string;
  snapshot: string;
}

export const MEMO_STRINGS: Record<Locale, MemoStrings> = {
  [Locale.En]: {
    backToMap: 'Back to map',
    print: 'Print / PDF',
    reportTitle: 'Property risk report',
    areaRadius: 'area: scan radius',
    areaCustom: 'area: custom outline',
    layersAssessed: 'layers assessed',
    schematicRadius: 'District footprint · scan radius · buildings from OpenStreetMap',
    schematicCustom: 'District footprint · custom outline · buildings from OpenStreetMap',
    conclusion: 'Conclusion',
    risksChecked: '{n} risks checked:',
    overallSuffix: 'risk overall',
    plainSummary: 'plain summary — narrative model unavailable',
    forLending: 'For lending & insurance',
    mitigationTitle: 'Mitigating evidence · external sources',
    modelled: 'modelled',
    assessed: 'assessed',
    mitigationNote:
      'Engine values in the table below are unchanged. This adjustment is evidence-based judgement, not a measurement.',
    secRisk: 'Risk factor assessment',
    thNum: '#',
    thFactor: 'Factor',
    thValue: 'Value',
    thRating: 'Rating',
    thVerdict: 'Verdict',
    secNeighbourhood: 'Neighbourhood within the scan radius',
    thCategory: 'Category',
    thCount: 'Count',
    thNearest: 'Nearest',
    thClosest: 'Closest object',
    thWhy: 'Why it matters',
    licensing: 'Licensing restrictions',
    secSources: 'Data sources',
    thLayer: 'Layer',
    thDataset: 'Dataset',
    thType: 'Type',
    thLicence: 'Licence',
    poweredBy: 'powered by Geo-Intelligence',
    snapshot: 'snapshot',
  },
  [Locale.Ru]: {
    backToMap: 'К карте',
    print: 'Печать / PDF',
    reportTitle: 'Отчёт о рисках объекта',
    areaRadius: 'зона: радиус сканирования',
    areaCustom: 'зона: свой контур',
    layersAssessed: 'слоёв оценено',
    schematicRadius: 'Схема района · радиус сканирования · здания из OpenStreetMap',
    schematicCustom: 'Схема района · свой контур · здания из OpenStreetMap',
    conclusion: 'Заключение',
    risksChecked: 'проверено рисков — {n}:',
    overallSuffix: 'риск в целом',
    plainSummary: 'простое резюме — модель нарратива недоступна',
    forLending: 'Для кредитования и страхования',
    mitigationTitle: 'Смягчающие данные · внешние источники',
    modelled: 'по модели',
    assessed: 'оценка',
    mitigationNote:
      'Значения движка в таблице ниже не изменены. Эта корректировка — экспертное суждение на основе доказательств, а не измерение.',
    secRisk: 'Оценка факторов риска',
    thNum: '№',
    thFactor: 'Фактор',
    thValue: 'Значение',
    thRating: 'Уровень',
    thVerdict: 'Вердикт',
    secNeighbourhood: 'Окружение в радиусе сканирования',
    thCategory: 'Категория',
    thCount: 'Кол-во',
    thNearest: 'Ближайший',
    thClosest: 'Ближайший объект',
    thWhy: 'Почему важно',
    licensing: 'Лицензионные ограничения',
    secSources: 'Источники данных',
    thLayer: 'Слой',
    thDataset: 'Набор данных',
    thType: 'Тип',
    thLicence: 'Лицензия',
    poweredBy: 'на платформе Geo-Intelligence',
    snapshot: 'снимок',
  },
  [Locale.Es]: {
    backToMap: 'Volver al mapa',
    print: 'Imprimir / PDF',
    reportTitle: 'Informe de riesgos del inmueble',
    areaRadius: 'área: radio de escaneo',
    areaCustom: 'área: contorno propio',
    layersAssessed: 'capas evaluadas',
    schematicRadius: 'Plano del distrito · radio de escaneo · edificios de OpenStreetMap',
    schematicCustom: 'Plano del distrito · contorno propio · edificios de OpenStreetMap',
    conclusion: 'Conclusión',
    risksChecked: '{n} riesgos evaluados:',
    overallSuffix: 'riesgo general',
    plainSummary: 'resumen simple — modelo narrativo no disponible',
    forLending: 'Para préstamo y seguro',
    mitigationTitle: 'Evidencia atenuante · fuentes externas',
    modelled: 'modelado',
    assessed: 'evaluado',
    mitigationNote:
      'Los valores del motor en la tabla siguiente no se modifican. Este ajuste es un juicio basado en evidencia, no una medición.',
    secRisk: 'Evaluación de factores de riesgo',
    thNum: '#',
    thFactor: 'Factor',
    thValue: 'Valor',
    thRating: 'Nivel',
    thVerdict: 'Veredicto',
    secNeighbourhood: 'Entorno dentro del radio de escaneo',
    thCategory: 'Categoría',
    thCount: 'Cantidad',
    thNearest: 'Más cercano',
    thClosest: 'Objeto más cercano',
    thWhy: 'Por qué importa',
    licensing: 'Restricciones de licencia',
    secSources: 'Fuentes de datos',
    thLayer: 'Capa',
    thDataset: 'Conjunto de datos',
    thType: 'Tipo',
    thLicence: 'Licencia',
    poweredBy: 'con tecnología de Geo-Intelligence',
    snapshot: 'instantánea',
  },
};

export const MASK_LABEL_I18N: Record<Locale, Record<MaskKey, string>> = {
  [Locale.En]: {
    noise: 'Noise',
    air: 'Air quality',
    flood: 'River flood risk',
    q100: 'River flood Q100',
    coastal: 'Coastal flooding',
    pluvial: 'Pluvial flooding',
    landslide: 'Landslides',
  },
  [Locale.Ru]: {
    noise: 'Шум',
    air: 'Качество воздуха',
    flood: 'Речной паводок (рельеф)',
    q100: 'Речной паводок Q100',
    coastal: 'Морское затопление',
    pluvial: 'Ливневое подтопление',
    landslide: 'Оползни',
  },
  [Locale.Es]: {
    noise: 'Ruido',
    air: 'Calidad del aire',
    flood: 'Inundación fluvial (terreno)',
    q100: 'Inundación fluvial Q100',
    coastal: 'Inundación costera',
    pluvial: 'Inundación pluvial',
    landslide: 'Deslizamientos',
  },
};

export const BAND_WORD: Record<Locale, Record<Band, string>> = {
  [Locale.En]: { low: 'low', moderate: 'moderate', high: 'high', severe: 'severe', unknown: 'no data' },
  [Locale.Ru]: {
    low: 'низкий',
    moderate: 'умеренный',
    high: 'высокий',
    severe: 'критический',
    unknown: 'нет данных',
  },
  [Locale.Es]: { low: 'bajo', moderate: 'moderado', high: 'alto', severe: 'grave', unknown: 'sin datos' },
};

export const KIND_TITLE_I18N: Record<Locale, Record<MaskKind, string>> = {
  [Locale.En]: { measured: 'Observation', official: 'Official dataset', modeled: 'Model (open data)' },
  [Locale.Ru]: {
    measured: 'Наблюдение',
    official: 'Официальный набор данных',
    modeled: 'Модель (открытые данные)',
  },
  [Locale.Es]: {
    measured: 'Observación',
    official: 'Conjunto de datos oficial',
    modeled: 'Modelo (datos abiertos)',
  },
};

export const KIND_TAG_I18N: Record<Locale, Record<MaskKind, string>> = {
  [Locale.En]: { measured: 'observed', official: 'official', modeled: 'model' },
  [Locale.Ru]: { measured: 'наблюдение', official: 'офиц.', modeled: 'модель' },
  [Locale.Es]: { measured: 'observado', official: 'oficial', modeled: 'modelo' },
};

export const NEIGHBOUR_LABEL_I18N: Record<Locale, Record<ActivityCategory, string>> = {
  [Locale.En]: {
    nightlife: 'nightlife',
    retail: 'large retail',
    venue: 'venues & leisure',
    hub: 'hubs & construction',
    hazard: 'hazardous neighbours',
  },
  [Locale.Ru]: {
    nightlife: 'ночная жизнь',
    retail: 'крупная розница',
    venue: 'площадки и досуг',
    hub: 'узлы и стройки',
    hazard: 'опасное соседство',
  },
  [Locale.Es]: {
    nightlife: 'ocio nocturno',
    retail: 'gran comercio',
    venue: 'recintos y ocio',
    hub: 'nodos y obras',
    hazard: 'vecinos peligrosos',
  },
};

export const NEIGHBOUR_MEANING_I18N: Record<Locale, Record<ActivityCategory, string>> = {
  [Locale.En]: {
    hazard: 'Fuel, storage tanks, substations, aerodromes — sources of fire, blast or contamination exposure.',
    hub: 'Stations, terminals and construction sites — traffic, dust and noise load.',
    nightlife: 'Bars, pubs, clubs — evening noise and footfall, relevant to residential use.',
    retail: 'Malls and large retail — delivery traffic and parking pressure.',
    venue: 'Stadiums, cinemas, theatres — event-driven peaks in crowds and traffic.',
  },
  [Locale.Ru]: {
    hazard: 'Топливо, резервуары, подстанции, аэродромы — источники пожара, взрыва или загрязнения.',
    hub: 'Станции, терминалы и стройплощадки — нагрузка от трафика, пыли и шума.',
    nightlife: 'Бары, пабы, клубы — вечерний шум и людской поток, важно для жилья.',
    retail: 'Торговые центры и крупная розница — грузовой трафик и нагрузка на парковки.',
    venue: 'Стадионы, кинотеатры, театры — пики скоплений и трафика во время событий.',
  },
  [Locale.Es]: {
    hazard: 'Combustible, depósitos, subestaciones, aeródromos — fuentes de incendio, explosión o contaminación.',
    hub: 'Estaciones, terminales y obras — carga de tráfico, polvo y ruido.',
    nightlife: 'Bares, pubs, discotecas — ruido nocturno y afluencia, relevante para uso residencial.',
    retail: 'Centros comerciales y gran comercio — tráfico de reparto y presión de aparcamiento.',
    venue: 'Estadios, cines, teatros — picos de aglomeración y tráfico por eventos.',
  },
};

const VERDICT_RU: Record<string, string> = {
  'Quiet — residential background level.': 'Тихо — жилой фоновый уровень.',
  'Moderate noise — traffic is audible.': 'Умеренный шум — слышен транспорт.',
  'Noisy — above the EU Lden comfort threshold.': 'Шумно — выше порога комфорта EU Lden.',
  'Very noisy — constant traffic roar.': 'Очень шумно — постоянный гул транспорта.',
  'No significant noise sources nearby.': 'Значимых источников шума поблизости нет.',
  'Good to excellent air quality (Google UAQI).': 'Хорошее или отличное качество воздуха (Google UAQI).',
  'Moderate air quality (Google UAQI).': 'Умеренное качество воздуха (Google UAQI).',
  'Low air quality (Google UAQI).': 'Пониженное качество воздуха (Google UAQI).',
  'Poor air quality (Google UAQI).': 'Плохое качество воздуха (Google UAQI).',
  'Air quality data unavailable for this location.': 'Данные о качестве воздуха для этой точки недоступны.',
  'Low terrain exposure to river flooding.': 'Низкая подверженность рельефа речным паводкам.',
  'Moderate proximity to the floodplain.': 'Умеренная близость к пойме.',
  'High risk — the site sits low above the water.': 'Высокий риск — площадка низко над водой.',
  'Very high risk — effectively within the flood zone.': 'Очень высокий риск — фактически в зоне паводка.',
  'No significant water nearby — terrain exposure is minimal.':
    'Значимой воды поблизости нет — подверженность рельефа минимальна.',
  'Outside the modelled 100-year river flood zone.': 'Вне смоделированной зоны 100-летнего речного паводка.',
  'Within the 100-year river flood zone, depth up to ~0.5 m.':
    'В зоне 100-летнего речного паводка, глубина до ~0,5 м.',
  'Within the 100-year river flood zone, depth 0.5–1.5 m.':
    'В зоне 100-летнего речного паводка, глубина 0,5–1,5 м.',
  'Within the 100-year river flood zone, depth above 1.5 m.':
    'В зоне 100-летнего речного паводка, глубина более 1,5 м.',
  'Outside the mapped 100-year river flood zone (JRC). Coastal surge is not covered by this layer.':
    'Вне картированной зоны 100-летнего речного паводка (JRC). Морской нагон этим слоем не учитывается.',
  'Dry, or above the 100-year extreme sea level.': 'Сухо или выше 100-летнего экстремального уровня моря.',
  'Shallow inundation at the asset under the 100-year storm surge.':
    'Небольшое затопление объекта при 100-летнем штормовом нагоне.',
  'Inundated at the asset under the 100-year storm surge.':
    'Объект затоплен при 100-летнем штормовом нагоне.',
  'Deep inundation at the asset under the 100-year storm surge.':
    'Глубокое затопление объекта при 100-летнем штормовом нагоне.',
  'Ground level at the asset could not be established, so surge exposure was not assessed.':
    'Отметку земли у объекта установить не удалось, поэтому подверженность нагону не оценивалась.',
  'Shallow ponding — puddle depth, drains off.': 'Мелкое скопление воды — глубина лужи, стекает.',
  'Minor ponding in local depressions during heavy rain.':
    'Незначительное скопление воды в локальных понижениях при сильном дожде.',
  'Noticeable water accumulation — ground-floor access affected.':
    'Заметное скопление воды — затрудняет доступ на первый этаж.',
  'Deep ponding — water stands well above street level.':
    'Глубокое скопление воды — вода стоит значительно выше уровня улицы.',
  'No local depressions for water to pool in.': 'Локальных понижений для скопления воды нет.',
  'Low slope susceptibility to landslides.': 'Низкая склонность склонов к оползням.',
  'Moderate landslide susceptibility.': 'Умеренная склонность к оползням.',
  'High slope susceptibility.': 'Высокая склонность склонов.',
  'Very high landslide susceptibility.': 'Очень высокая склонность к оползням.',
  'Flat / stable terrain.': 'Ровный / устойчивый рельеф.',
  'Data temporarily unavailable — layer not assessed.': 'Данные временно недоступны — слой не оценён.',
};

const VERDICT_ES: Record<string, string> = {
  'Quiet — residential background level.': 'Tranquilo — nivel de fondo residencial.',
  'Moderate noise — traffic is audible.': 'Ruido moderado — se oye el tráfico.',
  'Noisy — above the EU Lden comfort threshold.': 'Ruidoso — por encima del umbral de confort EU Lden.',
  'Very noisy — constant traffic roar.': 'Muy ruidoso — rugido de tráfico constante.',
  'No significant noise sources nearby.': 'No hay fuentes de ruido significativas cerca.',
  'Good to excellent air quality (Google UAQI).': 'Calidad del aire buena o excelente (Google UAQI).',
  'Moderate air quality (Google UAQI).': 'Calidad del aire moderada (Google UAQI).',
  'Low air quality (Google UAQI).': 'Calidad del aire baja (Google UAQI).',
  'Poor air quality (Google UAQI).': 'Mala calidad del aire (Google UAQI).',
  'Air quality data unavailable for this location.': 'Datos de calidad del aire no disponibles para esta ubicación.',
  'Low terrain exposure to river flooding.': 'Baja exposición del terreno a inundación fluvial.',
  'Moderate proximity to the floodplain.': 'Proximidad moderada a la llanura de inundación.',
  'High risk — the site sits low above the water.': 'Riesgo alto — el emplazamiento está bajo sobre el agua.',
  'Very high risk — effectively within the flood zone.':
    'Riesgo muy alto — prácticamente dentro de la zona inundable.',
  'No significant water nearby — terrain exposure is minimal.':
    'No hay agua significativa cerca — la exposición del terreno es mínima.',
  'Outside the modelled 100-year river flood zone.': 'Fuera de la zona modelada de inundación fluvial de 100 años.',
  'Within the 100-year river flood zone, depth up to ~0.5 m.':
    'Dentro de la zona de inundación fluvial de 100 años, profundidad hasta ~0,5 m.',
  'Within the 100-year river flood zone, depth 0.5–1.5 m.':
    'Dentro de la zona de inundación fluvial de 100 años, profundidad 0,5–1,5 m.',
  'Within the 100-year river flood zone, depth above 1.5 m.':
    'Dentro de la zona de inundación fluvial de 100 años, profundidad superior a 1,5 m.',
  'Outside the mapped 100-year river flood zone (JRC). Coastal surge is not covered by this layer.':
    'Fuera de la zona cartografiada de inundación fluvial de 100 años (JRC). Este capa no cubre la marea costera.',
  'Dry, or above the 100-year extreme sea level.': 'Seco, o por encima del nivel del mar extremo de 100 años.',
  'Shallow inundation at the asset under the 100-year storm surge.':
    'Inundación somera en el inmueble bajo la marejada de 100 años.',
  'Inundated at the asset under the 100-year storm surge.':
    'Inmueble inundado bajo la marejada de 100 años.',
  'Deep inundation at the asset under the 100-year storm surge.':
    'Inundación profunda en el inmueble bajo la marejada de 100 años.',
  'Ground level at the asset could not be established, so surge exposure was not assessed.':
    'No se pudo establecer la cota del terreno en el inmueble, por lo que no se evaluó la exposición a la marejada.',
  'Shallow ponding — puddle depth, drains off.': 'Encharcamiento somero — profundidad de charco, drena.',
  'Minor ponding in local depressions during heavy rain.':
    'Encharcamiento menor en depresiones locales durante lluvia intensa.',
  'Noticeable water accumulation — ground-floor access affected.':
    'Acumulación de agua apreciable — afecta al acceso a planta baja.',
  'Deep ponding — water stands well above street level.':
    'Encharcamiento profundo — el agua queda muy por encima del nivel de la calle.',
  'No local depressions for water to pool in.': 'No hay depresiones locales donde se acumule el agua.',
  'Low slope susceptibility to landslides.': 'Baja susceptibilidad de la pendiente a deslizamientos.',
  'Moderate landslide susceptibility.': 'Susceptibilidad moderada a deslizamientos.',
  'High slope susceptibility.': 'Alta susceptibilidad de la pendiente.',
  'Very high landslide susceptibility.': 'Susceptibilidad muy alta a deslizamientos.',
  'Flat / stable terrain.': 'Terreno llano / estable.',
  'Data temporarily unavailable — layer not assessed.': 'Datos temporalmente no disponibles — capa no evaluada.',
};

const VERDICT_I18N: Record<Locale, Record<string, string>> = {
  [Locale.En]: {},
  [Locale.Ru]: VERDICT_RU,
  [Locale.Es]: VERDICT_ES,
};

export function tVerdict(locale: Locale, englishVerdict: string): string {
  return VERDICT_I18N[locale][englishVerdict] ?? englishVerdict;
}

const EN_LABEL_TO_KEY: Record<string, MaskKey> = Object.fromEntries(
  (Object.keys(MASK_LABEL_I18N[Locale.En]) as MaskKey[]).map((k) => [MASK_LABEL_I18N[Locale.En][k], k]),
);

export function tMaskLabelEn(locale: Locale, englishLabel: string): string {
  const key = EN_LABEL_TO_KEY[englishLabel];
  return key ? MASK_LABEL_I18N[locale][key] : englishLabel;
}

const KIND_LABEL_RU: Record<string, string> = {
  nightclub: 'ночной клуб',
  bar: 'бар',
  pub: 'паб',
  mall: 'торговый центр',
  retail: 'магазин',
  market: 'рынок',
  stadium: 'стадион',
  'events venue': 'площадка мероприятий',
  cinema: 'кинотеатр',
  theatre: 'театр',
  'bus station': 'автовокзал',
  station: 'станция',
  'subway entrance': 'вход в метро',
  'tram stop': 'трамвайная остановка',
  'construction site': 'стройплощадка',
  'industrial area': 'промзона',
  'petrol station': 'АЗС',
  'fuel/gas storage tank': 'топливный резервуар',
  aerodrome: 'аэродром',
  'electrical substation': 'электроподстанция',
};

const KIND_LABEL_ES: Record<string, string> = {
  nightclub: 'discoteca',
  bar: 'bar',
  pub: 'pub',
  mall: 'centro comercial',
  retail: 'comercio',
  market: 'mercado',
  stadium: 'estadio',
  'events venue': 'recinto de eventos',
  cinema: 'cine',
  theatre: 'teatro',
  'bus station': 'estación de autobuses',
  station: 'estación',
  'subway entrance': 'entrada de metro',
  'tram stop': 'parada de tranvía',
  'construction site': 'obra',
  'industrial area': 'zona industrial',
  'petrol station': 'gasolinera',
  'fuel/gas storage tank': 'depósito de combustible',
  aerodrome: 'aeródromo',
  'electrical substation': 'subestación eléctrica',
};

const KIND_LABEL_TR: Record<Locale, Record<string, string>> = {
  [Locale.En]: {},
  [Locale.Ru]: KIND_LABEL_RU,
  [Locale.Es]: KIND_LABEL_ES,
};

export function tKind(locale: Locale, englishKind: string): string {
  return KIND_LABEL_TR[locale][englishKind] ?? englishKind;
}

export const DATE_LOCALE: Record<Locale, string> = {
  [Locale.En]: 'en-GB',
  [Locale.Ru]: 'ru-RU',
  [Locale.Es]: 'es-ES',
};
