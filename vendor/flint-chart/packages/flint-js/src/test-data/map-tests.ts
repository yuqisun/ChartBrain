// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Geographic gallery generators — Vega-Lite maps.
 *
 * Two generic chart types, each rendering US or World geography. Scope is
 * chosen by the `region` chart property; when left at its 'auto' default it is
 * inferred from the data (preferring the US). These gallery examples set
 * `region` *explicitly* (us / world) so each tile is unambiguous, even though
 * the same data would auto-detect the same frame.
 *
 *   - Map (bubble): a geoshape base with circles positioned by
 *     longitude/latitude and sized/coloured by a measure.
 *   - Choropleth: each region of the base TopoJSON filled by a measure, joined
 *     via the `id` channel. Rows carry ordinary place *names* (state/country);
 *     the choropleth gazetteer resolves those (or USPS / ISO codes) to the
 *     numeric feature ids in Vega's `us-10m.json` / `world-110m.json`.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';

// ---------------------------------------------------------------------------
// Bubble-map data: city, longitude, latitude, metro population (millions)
// ---------------------------------------------------------------------------

const WORLD_CITIES: Array<[string, number, number, number]> = [
    ['Tokyo', 139.69, 35.68, 37.4],
    ['Delhi', 77.10, 28.70, 32.9],
    ['Shanghai', 121.47, 31.23, 29.2],
    ['Dhaka', 90.41, 23.81, 23.2],
    ['São Paulo', -46.63, -23.55, 22.6],
    ['Mexico City', -99.13, 19.43, 22.3],
    ['Cairo', 31.24, 30.04, 22.2],
    ['Beijing', 116.41, 39.90, 21.7],
    ['Mumbai', 72.88, 19.08, 21.3],
    ['Osaka', 135.50, 34.69, 19.0],
    ['New York', -74.01, 40.71, 18.9],
    ['Karachi', 67.01, 24.86, 17.2],
    ['Istanbul', 28.98, 41.01, 16.0],
    ['Lagos', 3.38, 6.52, 15.9],
    ['Buenos Aires', -58.38, -34.60, 15.4],
    ['Moscow', 37.62, 55.75, 12.6],
    ['Los Angeles', -118.24, 34.05, 12.4],
    ['Paris', 2.35, 48.86, 11.1],
    ['Jakarta', 106.85, -6.21, 11.1],
    ['Lima', -77.04, -12.05, 11.0],
    ['Bangkok', 100.50, 13.76, 10.9],
    ['Seoul', 126.98, 37.57, 9.9],
    ['Johannesburg', 28.05, -26.20, 9.6],
    ['London', -0.13, 51.51, 9.5],
    ['Sydney', 151.21, -33.87, 5.3],
];

const US_CITIES: Array<[string, number, number, number]> = [
    ['New York', -74.01, 40.71, 18.9],
    ['Los Angeles', -118.24, 34.05, 12.4],
    ['Chicago', -87.63, 41.88, 9.3],
    ['Dallas', -96.80, 32.78, 7.6],
    ['Houston', -95.37, 29.76, 7.1],
    ['Washington', -77.04, 38.91, 6.3],
    ['Philadelphia', -75.17, 39.95, 6.2],
    ['Atlanta', -84.39, 33.75, 6.1],
    ['Miami', -80.19, 25.76, 6.1],
    ['Phoenix', -112.07, 33.45, 4.9],
    ['Boston', -71.06, 42.36, 4.9],
    ['San Francisco', -122.42, 37.77, 4.7],
    ['Seattle', -122.33, 47.61, 4.0],
    ['Minneapolis', -93.27, 44.98, 3.7],
    ['Denver', -104.99, 39.74, 2.9],
];

function bubbleMapCase(
    chartType: string,
    region: 'us' | 'world',
    title: string,
    description: string,
    cities: Array<[string, number, number, number]>,
): TestCase {
    const data = cities.map(([city, lon, lat, pop]) => ({ city, lon, lat, pop }));
    return {
        title,
        description,
        tags: ['map', 'geographic', 'bubble', 'gallery'],
        chartType,
        chartProperties: { region },
        data,
        fields: [makeField('city'), makeField('lon'), makeField('lat'), makeField('pop')],
        metadata: {
            city: { type: Type.String, semanticType: 'City', levels: [] },
            lon: { type: Type.Number, semanticType: 'Longitude', levels: [] },
            lat: { type: Type.Number, semanticType: 'Latitude', levels: [] },
            pop: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        },
        encodingMap: {
            longitude: makeEncodingItem('lon'),
            latitude: makeEncodingItem('lat'),
            size: makeEncodingItem('pop'),
            color: makeEncodingItem('pop'),
        },
    };
}

export function genMapTests(): TestCase[] {
    return [
        bubbleMapCase(
            'Map',
            'us',
            'US metro areas',
            'One circle per US metro area, placed by longitude/latitude and '
            + 'sized + coloured by population (millions). The region property is '
            + 'set to US, so the map uses an albersUsa frame.',
            US_CITIES,
        ),
        bubbleMapCase(
            'Map',
            'world',
            'World metro areas',
            'One circle per metropolitan area, placed by longitude/latitude and '
            + 'sized + coloured by population (millions). The region property is '
            + 'set to World, so the map uses an Equal-Earth frame.',
            WORLD_CITIES,
        ),
    ];
}

// ---------------------------------------------------------------------------
// Choropleth data
// ---------------------------------------------------------------------------

// US states: name, 2020 population (millions). The choropleth gazetteer maps
// the name (or a USPS code / FIPS id) to the numeric feature id in us-10m.json.
const US_STATES: Array<[string, number]> = [
    ['Alabama', 5.02], ['Alaska', 0.73], ['Arizona', 7.15], ['Arkansas', 3.01],
    ['California', 39.54], ['Colorado', 5.77], ['Connecticut', 3.61], ['Delaware', 0.99],
    ['District of Columbia', 0.69], ['Florida', 21.54], ['Georgia', 10.71], ['Hawaii', 1.46],
    ['Idaho', 1.84], ['Illinois', 12.81], ['Indiana', 6.79], ['Iowa', 3.19],
    ['Kansas', 2.94], ['Kentucky', 4.51], ['Louisiana', 4.66], ['Maine', 1.36],
    ['Maryland', 6.18], ['Massachusetts', 7.03], ['Michigan', 10.08], ['Minnesota', 5.71],
    ['Mississippi', 2.96], ['Missouri', 6.15], ['Montana', 1.08], ['Nebraska', 1.96],
    ['Nevada', 3.10], ['New Hampshire', 1.38], ['New Jersey', 9.29], ['New Mexico', 2.12],
    ['New York', 20.20], ['North Carolina', 10.44], ['North Dakota', 0.78], ['Ohio', 11.80],
    ['Oklahoma', 3.96], ['Oregon', 4.24], ['Pennsylvania', 13.00], ['Rhode Island', 1.10],
    ['South Carolina', 5.12], ['South Dakota', 0.89], ['Tennessee', 6.91], ['Texas', 29.15],
    ['Utah', 3.27], ['Vermont', 0.64], ['Virginia', 8.63], ['Washington', 7.71],
    ['West Virginia', 1.79], ['Wisconsin', 5.89], ['Wyoming', 0.58],
];

// World countries: name, 2023 population (millions). The choropleth gazetteer
// maps the name (or an ISO alpha-2 / alpha-3 / numeric code) to the numeric
// feature id in world-110m.json.
const WORLD_COUNTRIES: Array<[string, number]> = [
    ['China', 1410], ['India', 1428], ['United States', 339], ['Indonesia', 277],
    ['Pakistan', 240], ['Nigeria', 223], ['Brazil', 216], ['Bangladesh', 173],
    ['Russia', 144], ['Mexico', 128], ['Ethiopia', 126], ['Japan', 124],
    ['Philippines', 117], ['Egypt', 112], ['DR Congo', 102], ['Vietnam', 98],
    ['Iran', 89], ['Turkey', 85], ['Germany', 84], ['Thailand', 71],
    ['United Kingdom', 67], ['France', 68], ['South Africa', 60], ['Italy', 59],
    ['Kenya', 55], ['Colombia', 52], ['Spain', 47], ['Argentina', 46],
    ['Algeria', 45], ['Canada', 39], ['Poland', 38], ['Ukraine', 37],
    ['Saudi Arabia', 37], ['Morocco', 37], ['Peru', 34], ['Australia', 26],
    ['Kazakhstan', 19], ['Chile', 19], ['Sweden', 10], ['Norway', 5.5],
];

function choroplethCase(
    chartType: string,
    region: 'us' | 'world',
    title: string,
    description: string,
    placeType: 'State' | 'Country',
    rows: Array<[string, number]>,
): TestCase {
    const regionField = placeType === 'State' ? 'state' : 'country';
    const data = rows.map(([region, value]) => ({ [regionField]: region, value }));
    return {
        title,
        description,
        tags: ['map', 'geographic', 'choropleth', 'gallery'],
        chartType,
        chartProperties: { region },
        data,
        fields: [makeField(regionField), makeField('value')],
        metadata: {
            [regionField]: { type: Type.String, semanticType: placeType, levels: [] },
            value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        },
        encodingMap: {
            id: makeEncodingItem(regionField),
            color: makeEncodingItem('value'),
        },
    };
}

export function genChoroplethTests(): TestCase[] {
    return [
        choroplethCase(
            'Choropleth',
            'us',
            'US states',
            'Each US state filled by its 2020 population (millions). The region '
            + 'property is set to US. Rows carry plain state names; the gazetteer '
            + 'resolves them (or USPS codes / FIPS ids) to the us-10m.json '
            + 'TopoJSON feature ids.',
            'State',
            US_STATES,
        ),
        choroplethCase(
            'Choropleth',
            'world',
            'World countries',
            'Each country filled by its 2023 population (millions). The region '
            + 'property is set to World. Rows carry plain country names; the '
            + 'gazetteer resolves them (or ISO alpha-2/alpha-3 codes) to the '
            + 'world-110m.json TopoJSON feature ids.',
            'Country',
            WORLD_COUNTRIES,
        ),
    ];
}
