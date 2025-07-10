# System Architecture Overview

This application integrates with the Copernicus Data Space Ecosystem to analyze Sentinel-2 satellite imagery for forest biomass estimation. It processes 10 years of historical data to track forest growth and health.

## 1. Sentinel-2 Satellite & Spectral Bands

### What is Sentinel-2?

- European Space Agency (ESA) satellite constellation (2 satellites: Sentinel-2A and 2B)
- Revisit time: 5 days at equator, 2-3 days at mid-latitudes
- Spatial resolution: 10m for key bands (B02, B03, B04, B08)
- Swath width: 290 km

### Key Spectral Bands Used:
- **B04 (Red)**: 665 nm wavelength - 10m resolution
- **B08 (NIR - Near Infrared)**: 842 nm wavelength - 10m resolution
- **SCL (Scene Classification Layer)**: Cloud/snow/water mask - 20m resolution

### Why These Bands?

- **Red (B04)**: Absorbed by chlorophyll in healthy vegetation
- **NIR (B08)**: Strongly reflected by healthy vegetation's cellular structure
- This contrast enables NDVI calculation

## 2. NDVI (Normalized Difference Vegetation Index)

### Formula:
```
NDVI = (NIR - Red) / (NIR + Red) = (B08 - B04) / (B08 + B04)
```

### Value Interpretation:

- **0.6-0.9**: Dense, healthy forest canopy
- **0.3-0.6**: Moderate vegetation/young forest
- **0.1-0.3**: Sparse vegetation/stressed forest
- **0-0.1**: Bare soil/non-vegetated
- **< 0**: Water bodies

### Why NDVI Works:

- Healthy vegetation absorbs red light for photosynthesis
- Internal leaf structure reflects NIR strongly
- The ratio normalizes for illumination differences

## 3. Data Acquisition Pipeline

### Authentication Flow:
```javascript
// OAuth2 authentication with Copernicus Data Space
POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
Body: grant_type=client_credentials&client_id=XXX&client_secret=YYY
Returns: Access token (valid 10 minutes)
```

### Step 1: Discovery - Catalog API
```javascript
// Find available cloud-free acquisitions
POST https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search
{
  bbox: [west, south, east, north],
  datetime: "2024-06-01/2024-08-31",  // Summer months only
  collections: ["sentinel-2-l2a"],     // Level-2A = atmospherically corrected
  filter: "eo:cloud_cover < 30"       // Max 30% cloud cover
}
```

### Step 2: Processing - Process API
```javascript
// Extract NDVI for specific polygon and date
POST https://sh.dataspace.copernicus.eu/api/v1/process
{
  input: {
    bounds: {
      bbox: [lon_min, lat_min, lon_max, lat_max],
      geometry: geoJsonPolygon  // Exact forest boundary for clipping
    },
    data: [{
      type: "sentinel-2-l2a",
      dataFilter: {
        timeRange: { from: acquisitionDate, to: nextDay },
        mosaickingOrder: "leastCC"  // Least cloud coverage first
      }
    }]
  },
  output: {
    width: 50-300,   // Adaptive based on polygon size
    height: 50-300,  // Higher res for smaller areas
    responses: [{ format: { type: "image/tiff" } }]
  },
  evalscript: customScript  // NDVI calculation + cloud masking
}
```

### Adaptive Resolution Logic:

- **< 1 km²**: 50×50 pixels (20m/pixel)
- **1-5 km²**: 100×100 pixels
- **5-20 km²**: 200×200 pixels
- **> 20 km²**: 300×300 pixels

## 4. Cloud Masking with Scene Classification Layer (SCL)

The app uses Sentinel-2's SCL band to filter out unreliable pixels:

```javascript
// SCL Values filtered out:
SCL_CLOUD_MEDIUM = 8    // Medium probability clouds
SCL_CLOUD_HIGH = 9      // High probability clouds
SCL_THIN_CIRRUS = 10    // Cirrus clouds
SCL_SNOW_ICE = 11       // Snow/ice

// Only process:
SCL_VEGETATION = 4      // Vegetation pixels
SCL_NOT_VEGETATED = 5   // Bare soil
SCL_WATER = 6          // Water (for contrast)
```

## 5. Biomass Estimation Model

### Logistic Growth Model:
```javascript
// Growth follows S-curve (logistic function)
growthFactor = 1 - e^(-r × age)

Where:
- r = species-specific growth rate
- age = current forest age in years
```

### NDVI-Biomass Coupling:
```javascript
// NDVI indicates canopy density/health
ndviFactor = min(1, NDVI / NDVIsaturation)

// Final biomass calculation
Biomass = YoungBiomass + (MaxBiomass - YoungBiomass) × growthFactor × ndviFactor
```

### Species-Specific Parameters (from Finnish Forest Research Institute):
- **Pine**: Max 450 t/ha, growth rate 0.08/year, NDVI saturation 0.85
- **Fir**: Max 500 t/ha, growth rate 0.07/year, NDVI saturation 0.88
- **Birch**: Max 300 t/ha, growth rate 0.12/year, NDVI saturation 0.82
- **Aspen**: Max 250 t/ha, growth rate 0.15/year, NDVI saturation 0.80

## 6. Time Series Processing

### Data Collection Strategy:

- **Temporal range**: Last 10 years (2015-2024)
- **Season**: June-August only (peak growing season)
- **Frequency**: Every available cloud-free acquisition
- **Result**: ~50-150 data points over 10 years

### Noise Reduction:
```javascript
// 7-day rolling average to smooth:
// - Atmospheric variations
// - Sensor calibration differences
// - View angle effects
// - Residual thin clouds
```

## 7. GeoTIFF Processing

The app receives NDVI data as 32-bit floating-point GeoTIFF:

```javascript
// GeoTIFF structure:
- Format: Single-band FLOAT32
- Compression: DEFLATE/LZW
- Values: -1.0 to 1.0 (NDVI range)
- NoData: NaN (masked pixels)

// Processing with GeoTIFF.js:
const tiff = await GeoTIFF.fromArrayBuffer(response);
const rasters = await image.readRasters();
const ndviArray = rasters[0];  // Float32Array
```

## 8. Key Technical Features

### Coordinate System Handling:

- **Input**: WGS84 (EPSG:4326) - latitude/longitude
- **CRS**: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" (lon,lat order)
- **Critical**: Must convert from [lat,lng] to [lng,lat] for API

### Performance Optimizations:

- Adaptive resolution based on polygon size
- Rate limiting: 500ms between API calls
- Parallel processing where possible
- Client-side caching of results

### Quality Metrics Provided:

- **Coverage %**: Non-cloudy pixels in polygon
- **Vegetation %**: Pixels with NDVI > 0.3
- **Valid pixels**: Total measurements used
- **Rolling averages**: Smoothed trends

## 9. Common Customer Questions & Answers

**Q: How accurate is the biomass estimation?**
A: Typical accuracy is ±20-30% compared to field measurements. NDVI-based estimates are most accurate for relative changes rather than absolute values.

**Q: Why only summer data?**
A: Maximum vegetation activity, minimal snow cover, and best NDVI signal occur June-August in Finland.

**Q: What causes gaps in the time series?**
A: Persistent cloud cover. Finland can have weeks of cloudy weather preventing satellite observations.

**Q: Can this detect forest damage/disease?**
A: Yes - sudden NDVI drops indicate stress, damage, or harvesting. Gradual declines suggest disease or drought.

**Q: Why 10m resolution?**
A: Sentinel-2's red and NIR bands are natively 10m. This allows monitoring of ~0.01 hectare patches.

**Q: Processing time expectations?**
A: 3-10 minutes for full 10-year analysis, depending on polygon size and available acquisitions.

## 10. Data Validation & Error Handling

The system includes multiple validation layers:

- Coordinate boundary checking
- NDVI range validation (-1 to 1)
- Cloud coverage thresholds
- Minimum valid pixel requirements
- Token expiration monitoring

### How the Code Handles Data Retrieval
- **API Endpoint**: The code sends POST requests to `https://sh.dataspace.copernicus.eu/api/v1/process` (in the `fetchNDVIData` function). This is the Process API, designed for custom processing of satellite data without downloading entire scenes.
- **Input Specification**:
  - It defines the input data collection as `sentinel-2-l2a` (atmospherically corrected Sentinel-2 Level-2A data).
  - It specifies a bounding box (bbox) and exact polygon geometry for clipping.
  - Time range is tightly constrained (e.g., a single day per acquisition to match available dates from the Catalog API).
  - Filters like `maxCloudCoverage: 30` and `mosaickingOrder: "leastCC"` ensure low-cloud data is prioritized.
- **Evalscript Processing**:
  - The code includes a custom JavaScript evalscript (required for Process API requests) that runs on the server-side.
  - This script requests specific bands: B04 (Red), B08 (Near-Infrared), SCL (Scene Classification Layer for cloud/snow/water masking), and dataMask.
  - It computes NDVI for each pixel: `ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 1e-10)`.
  - It applies masks: Excludes cloudy/snowy pixels based on SCL values and sets them to NaN.
  - Output: A single-band raster with FLOAT32 NDVI values (range: -1 to 1, with NaN for invalid pixels).
- **Output Format**: The response is requested as `image/tiff` (GeoTIFF), with adaptive width/height (50x50 to 300x300 pixels based on polygon size for efficiency).
- **Response Handling**:
  - The fetch returns an ArrayBuffer of the GeoTIFF.
  - GeoTIFF.js parses it to extract metadata (width, height) and the raster data (Float32Array of NDVI values).
  - It filters out NaN, computes statistics (mean, min, max, land cover classifications), and discards invalid values.
  - No full image is displayed or stored; only aggregated NDVI stats are used for biomass estimation.

### Why This Isn't Fetching "Actual Images"
- **On-the-Fly Processing**: The Process API does not download or return raw/full satellite scenes (which are large multi-band files, often gigabytes per scene). Instead, it processes the requested bands from the archived Sentinel-2 data on the server, applies the evalscript (e.g., NDVI calculation and masking), clips to the user's geometry/bbox, resamples to the specified resolution, and returns only the derived product.
- **Efficiency Focus**: This approach avoids transferring unnecessary data. For example:
  - Full Sentinel-2 scenes cover ~290km swaths with 13 bands at up to 10m resolution.
  - The code requests tiny clips (e.g., 50-300 pixels) of a single computed band, resulting in small TIFF files (~10-100 KB per request).
- **Catalog API Integration**: Before processing, it uses the Catalog API (`https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search`) to find available acquisition dates with <30% cloud cover. This informs which dates to process but doesn't fetch any imagery.
- **No Raw Data Download**: The code never accesses endpoints for full product downloads (e.g., Open Access Hub APIs for ZIP files). It relies entirely on processed outputs.

### Supporting Evidence from Copernicus/Sentinel Hub Documentation
- The Process API "generates images using satellite data for a user-specified area of interest, time range, processing, and visualization" without requiring full scene downloads.
- Evalscripts define server-side computation (e.g., NDVI from bands), and outputs are customizable (e.g., TIFF with FLOAT32 samples).
- Returned TIFFs are processed rasters: Single-band, compressed (DEFLATE/LZW), with values in the specified unit (reflectance by default, but computed NDVI here).
- For Sentinel-2 L2A, bands like B04/B08 are inputs, but the API handles atmospheric correction and mosaicking internally.
- This is optimized for derived products; full scenes would use different APIs (e.g., OData for direct downloads).

# User Instructions

## 1. Authentication Setup

### Option A - Direct OAuth2:
Register at [Copernicus Data Space](https://dataspace.copernicus.eu) → Create OAuth2 client → Enter Client ID & Secret → Click "Authenticate"

### Option B - Manual Token:
If CORS blocks direct auth, enable "Use manual token mode" → Get token via POST request to:
```
https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
```
with body: `grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET`

Token expires in 10 minutes - re-authenticate as needed

## 2. Drawing Forest Polygons

- Click the polygon tool (pentagon icon) in the map's top-left control panel
- Click on the map to place vertices of your forest boundary
- Complete the polygon by clicking the first vertex again
- Draw multiple forests to compare - click each to select for analysis
- Use the trash icon to delete all polygons and start over
- **Important:** Draw polygons over actual forested areas visible in satellite imagery for accurate results

## 3. Forest Parameters

### Forest Type:
Select species (Pine, Fir, Birch, Aspen) - affects growth curves and maximum biomass

### Forest Age:
Estimated age of forest at the start of analysis period (default: 20 years)

### Default Parameters Source:
Growth models calibrated with data from Luke (Finnish Natural Resources Institute):
- **Pine:** Max 450 t/ha, growth rate 0.08/year, NDVI saturation 0.85
- **Fir:** Max 500 t/ha, growth rate 0.07/year, NDVI saturation 0.88
- **Birch:** Max 350 t/ha, growth rate 0.12/year, NDVI saturation 0.82
- **Aspen:** Max 250 t/ha, growth rate 0.15/year, NDVI saturation 0.80

## 4. Running Analysis

- After authentication and polygon drawing, click "Analyze with Process API"
- Processing retrieves all cloud-free Sentinel-2 acquisitions from summer months (June-August) for the past 10 years
- Each acquisition is processed individually (~500ms per image) - expect 3-10 minutes for full analysis
- Progress updates show current processing stage

## 5. Interpreting Results

### NDVI (Normalized Difference Vegetation Index):
- **0.6-0.9:** Healthy, dense forest vegetation
- **0.3-0.6:** Moderate vegetation/young forest
- **0.1-0.3:** Sparse vegetation/stressed forest
- **<0.1:** Non-vegetated/water/bare soil

### Biomass Estimates:
- Calculated using logistic growth model coupled with NDVI measurements
- Units: tons/hectare (dry biomass)
- Typical mature forest: 200-500 t/ha depending on species
- Annual growth: 5-20 t/ha/year for healthy forests

### Chart Interpretation:
- **Individual points:** Daily satellite acquisitions (weather permitting)
- **Thick lines:** 7-day rolling averages (smooths atmospheric noise)
- **Seasonal variations:** Normal - highest NDVI/biomass in mid-summer
- **Long-term trend:** Should show steady increase for growing forests

### Quality Indicators:
- **Coverage %:** Portion of polygon with valid (non-cloudy) data
- **Vegetation %:** Pixels classified as vegetated (>80% expected for forests)
- **Valid Pixels:** Number of measurements used for statistics

## 6. Troubleshooting

### Low NDVI values:
Verify polygon is over forested area, not water/urban/agricultural land

### No data found:
Area may have persistent cloud cover - try different location

### Authentication errors:
Token expired (10min limit) or incorrect credentials

### CORS errors:
Use manual token mode instead of direct authentication

## 💡 Tip:
Start with a small test polygon (~10-50 hectares) to verify setup before analyzing large areas. Export results as CSV for further analysis in Excel or R/Python.