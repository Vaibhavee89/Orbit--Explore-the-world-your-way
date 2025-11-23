
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This file defines the main `gdm-map-app` LitElement component.
 * This component is responsible for:
 * - Rendering the user interface, including the Google Photorealistic 3D Map,
 *   chat messages area, and user input field.
 * - Managing the state of the chat (e.g., idle, generating, thinking).
 * - Handling user input and sending messages to the Gemini AI model.
 * - Processing responses from the AI, including displaying text and handling
 *   function calls (tool usage) related to map interactions.
 * - Integrating with the Google Maps JavaScript API to load and control the map,
 *   display markers, polylines for routes, and geocode locations.
 * - Providing the `handleMapQuery` method, which is called by the MCP server
 *   (via index.tsx) to update the map display.
 */

// Google Maps JS API Loader: Used to load the Google Maps JavaScript API.
import {Loader} from '@googlemaps/js-api-loader';
import hljs from 'highlight.js';
import {html, LitElement, PropertyValueMap} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {Marked} from 'marked';
import {markedHighlight} from 'marked-highlight';

import {MapParams} from './mcp_maps_server';

/** Markdown formatting function with syntax hilighting */
export const marked = new Marked(
  markedHighlight({
    async: true,
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, {language}).value;
    },
  }),
);

const ICON_BUSY = html`<svg
  class="rotating"
  xmlns="http://www.w3.org/2000/svg"
  height="24px"
  viewBox="0 -960 960 960"
  width="24px"
  fill="currentColor">
  <path
    d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z" />
</svg>`;

/**
 * Chat state enum to manage the current state of the chat interface.
 */
export enum ChatState {
  IDLE,
  GENERATING,
  THINKING,
  EXECUTING,
}

/**
 * Chat tab enum to manage the current selected tab in the chat interface.
 */
enum ChatTab {
  GEMINI,
  BUCKET_LIST,
}

/**
 * Chat role enum to manage the current role of the message.
 */
export enum ChatRole {
  USER,
  ASSISTANT,
  SYSTEM,
}

interface BucketItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  notes?: string;
  addedAt: number;
}

interface WeatherInfo {
  temperature: number;
  windspeed: number;
  weathercode: number;
  is_day: number;
}

// Google Maps API Key: Loaded from environment variable.
// This key is essential for loading and using Google Maps services.
// Ensure this key is configured with access to the "Maps JavaScript API",
// "Geocoding API", and the "Directions API".
// Set GOOGLE_MAPS_API_KEY in your .env file
const USER_PROVIDED_GOOGLE_MAPS_API_KEY: string =
  process.env.GOOGLE_MAPS_API_KEY || '';

const EXAMPLE_PROMPTS = [
  "I want to start a bucket list of amazing places.",
  "Show me the Northern Lights in Norway and add it to my list.",
  "Take me to Santorini, Greece.",
  "Where is the Great Barrier Reef? I want to go there.",
  "Show me a virtual preview of Kyoto, Japan.",
  "Add the Grand Canyon to my bucket list.",
  "Plan a trip to Italy and show me the Colosseum.",
  "I've always wanted to see the Pyramids of Giza.",
  "Show me New York City and save it.",
  "Let's go to Bora Bora.",
];

/**
 * MapApp component for Photorealistic 3D Maps.
 */
@customElement('gdm-map-app')
export class MapApp extends LitElement {
  @query('#anchor') anchor?: HTMLDivElement;
  // Google Maps: Reference to the <gmp-map-3d> DOM element where the map is rendered.
  @query('#mapContainer') mapContainerElement?: HTMLElement; // Will be <gmp-map-3d>
  @query('#messageInput') messageInputElement?: HTMLInputElement;
  
  // Reference to the 3D Avatar Model
  @query('#avatarModel') avatarModelElement?: any;

  @state() chatState = ChatState.IDLE;
  @state() isRunning = true;
  @state() selectedChatTab = ChatTab.GEMINI;
  @state() inputMessage = '';
  @state() messages: HTMLElement[] = [];
  @state() mapInitialized = false;
  @state() mapError = '';
  @state() bucketList: BucketItem[] = [];
  @state() showPano = false;
  @state() isPanoExpanded = false;
  @state() routePath: {lat: number; lng: number}[] = [];
  @state() isSimulating = false;
  @state() isExplorationMode = false;
  @state() isAvatarMode = false; // Toggle between Street View and 3D Avatar
  @state() isListening = false;
  @state() voiceTranscript = '';
  @state() isOrbiting = false;
  @state() isAutoRotating = false;
  @state() isAutoTour = false;
  @state() ambientSoundEnabled = false;
  
  @state() currentLocation: {lat: number, lng: number} | null = null;
  @state() currentLocationName: string | null = null;
  @state() weatherData: WeatherInfo | null = null;
  @state() showWeather = false;

  // Speech / Narration State
  @state() shouldSpeakNextResponse = false;
  @state() isSpeaking = false;

  // Google Maps: Instance of the Google Maps 3D map.
  private map?: any;
  // Google Maps: Instance of the Google Maps Geocoding service.
  private geocoder?: any;
  // Google Maps: Instance of the current search marker (Marker3DElement).
  private searchMarker?: any;
  // Map to hold persistent markers for bucket list items (id -> Marker3DElement)
  private bucketMarkers: Map<string, any> = new Map();

  // Google Maps: References to 3D map element constructors.
  private Map3DElement?: any;
  private Marker3DElement?: any;
  private Polyline3DElement?: any;
  private Model3DElement?: any; // For the Avatar

  // Google Maps: Instance of the Google Maps Directions service.
  private directionsService?: any;
  // Google Maps: Instance of the current route polyline.
  private routePolyline?: any;
  // Google Maps: Markers for origin and destination of a route.
  private originMarker?: any;
  private destinationMarker?: any;

  // Street View
  private streetViewService?: any;
  private StreetViewPanorama?: any;
  private panorama?: any;

  // Speech Recognition
  private recognition: any;
  
  // Avatar Animation Loop State
  private keysPressed = new Set<string>();
  private avatarLat = 0;
  private avatarLng = 0;
  private avatarHeading = 0;
  private animationFrameId?: number;
  private orbitFrameId?: number;
  private autoRotateIntervalId?: number;
  private autoTourIntervalId?: number;
  private ambientAudio?: HTMLAudioElement;


  sendMessageHandler?: CallableFunction;

  constructor() {
    super();
    // Set initial input from a random example prompt
    this.setNewRandomPrompt();
    this.loadBucketList();
    this.setupKeyboardListeners();
  }

  createRenderRoot() {
    return this;
  }

  protected firstUpdated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>,
  ): void {
    // Google Maps: Load the map when the component is first updated.
    this.loadMap();
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('bucketList')) {
      this.saveBucketList();
      this.syncBucketMarkers();
    }
    
    if (changedProperties.has('isAvatarMode')) {
        if (this.isAvatarMode) {
            this.stopOrbitLoop(); // Stop standalone orbit, avatar loop handles it if needed
            this.startAvatarGameLoop();
        } else {
            this.stopAvatarGameLoop();
            // Resume standalone orbit if active
            if (this.isOrbiting) {
                this.startOrbitLoop();
            }
        }
    }
    
    if (changedProperties.has('isOrbiting') && !this.isAvatarMode) {
        if (this.isOrbiting) {
            this.startOrbitLoop();
        } else {
            this.stopOrbitLoop();
        }
    }
  }

  private loadBucketList() {
    try {
      const stored = localStorage.getItem('gdm-bucket-list');
      if (stored) {
        this.bucketList = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load bucket list', e);
    }
  }

  private saveBucketList() {
    try {
      localStorage.setItem('gdm-bucket-list', JSON.stringify(this.bucketList));
    } catch (e) {
      console.warn('Failed to save bucket list', e);
    }
  }

  /**
   * Sets the input message to a new random prompt from EXAMPLE_PROMPTS.
   */
  private setNewRandomPrompt() {
    if (EXAMPLE_PROMPTS.length > 0) {
      this.inputMessage =
        EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)];
    }
  }

  /**
   * Google Maps: Loads the Google Maps JavaScript API using the JS API Loader.
   */
  async loadMap() {
    const isApiKeyPlaceholder =
      USER_PROVIDED_GOOGLE_MAPS_API_KEY ===
        'YOUR_ACTUAL_GOOGLE_MAPS_API_KEY_REPLACE_ME' ||
      USER_PROVIDED_GOOGLE_MAPS_API_KEY === '';

    if (isApiKeyPlaceholder) {
      this.mapError = `Google Maps API Key is not configured correctly.
Please edit the map_app.ts file and replace the placeholder value for
USER_PROVIDED_GOOGLE_MAPS_API_KEY with your actual API key.`;
      console.error(this.mapError);
      return;
    }

    const loader = new Loader({
      apiKey: USER_PROVIDED_GOOGLE_MAPS_API_KEY,
      version: 'weekly',
      libraries: ['geocoding', 'routes', 'geometry'],
    });

    try {
      await loader.load();
      const maps3dLibrary = await (window as any).google.maps.importLibrary('maps3d');
      const streetViewLibrary = await (window as any).google.maps.importLibrary('streetView');

      this.Map3DElement = maps3dLibrary.Map3DElement;
      this.Marker3DElement = maps3dLibrary.Marker3DElement;
      this.Polyline3DElement = maps3dLibrary.Polyline3DElement;
      this.Model3DElement = maps3dLibrary.Model3DElement;
      
      this.StreetViewPanorama = streetViewLibrary.StreetViewPanorama;
      this.streetViewService = new streetViewLibrary.StreetViewService();

      if ((window as any).google && (window as any).google.maps) {
        this.directionsService = new (
          window as any
        ).google.maps.DirectionsService();
      }

      this.initializeMap();
      this.mapInitialized = true;
      this.mapError = '';
      
      // Sync markers once map is ready
      this.syncBucketMarkers();
    } catch (error) {
      console.error('Error loading Google Maps API:', error);
      this.mapError =
        'Could not load Google Maps. Ensure API key is correct.';
      this.mapInitialized = false;
    }
  }

  initializeMap() {
    if (!this.mapContainerElement || !this.Map3DElement) {
      console.error('Map container or Map3DElement class not ready.');
      return;
    }
    this.map = this.mapContainerElement;
    if ((window as any).google && (window as any).google.maps) {
      this.geocoder = new (window as any).google.maps.Geocoder();
    }
  }

  setChatState(state: ChatState) {
    this.chatState = state;
  }

  private _clearTemporaryMapElements() {
    if (this.searchMarker) {
      this.searchMarker.remove();
      this.searchMarker = undefined;
    }
    if (this.routePolyline) {
      this.routePolyline.remove();
      this.routePolyline = undefined;
    }
    if (this.originMarker) {
      this.originMarker.remove();
      this.originMarker = undefined;
    }
    if (this.destinationMarker) {
      this.destinationMarker.remove();
      this.destinationMarker = undefined;
    }
    this.routePath = [];
  }

  /**
   * Synchronizes the 3D markers on the map with the bucketList state.
   */
  private syncBucketMarkers() {
    if (!this.map || !this.Marker3DElement) return;

    // 1. Remove markers for items that are no longer in the list
    const currentIds = new Set(this.bucketList.map(i => i.id));
    for (const [id, marker] of this.bucketMarkers) {
      if (!currentIds.has(id)) {
        marker.remove();
        this.bucketMarkers.delete(id);
      }
    }

    // 2. Add markers for new items
    for (const item of this.bucketList) {
      if (!this.bucketMarkers.has(item.id)) {
        const marker = new this.Marker3DElement();
        marker.position = {
          lat: item.lat,
          lng: item.lng,
          altitude: 0,
        };
        marker.label = item.name;
        // Distinguish bucket list markers (e.g. Gold/Orange)
        marker.style = {
            backgroundColor: 'gold',
            color: { r: 255, g: 215, b: 0, a: 1 } 
        };
        (this.map as any).appendChild(marker);
        this.bucketMarkers.set(item.id, marker);
      }
    }
  }

  private async _searchAndShowPano(lat: number, lng: number) {
    if (!this.streetViewService) return;

    this.streetViewService.getPanorama({
        location: {lat, lng},
        radius: 500, // Search radius in meters
        preference: 'nearest', 
        source: 'outdoor', 
    }, (data: any, status: string) => {
        if (status === 'OK' && data) {
            this.showPano = true;
            // Allow time for the div to render
            setTimeout(() => {
                const panoElement = document.getElementById('pano');
                if (panoElement && this.StreetViewPanorama) {
                    this.panorama = new this.StreetViewPanorama(panoElement, {
                        pano: data.location.pano,
                        disableDefaultUI: false, // Enable controls for navigation
                        addressControl: false,
                        fullscreenControl: false,
                        linksControl: true,
                        panControl: true,
                        enableCloseButton: false,
                        controlSize: 32,
                    });
                    this.panorama.setPov({
                        heading: 0,
                        pitch: 0
                    });
                    
                    // Add smooth transition animation
                    this.animatePanoTransition();
                    
                    // Listener for position updates to sync mini-map in exploration mode
                    this.panorama.addListener("position_changed", () => {
                        const pos = this.panorama.getPosition();
                        if (this.isExplorationMode && !this.isAvatarMode && pos && this.map) {
                            // Update Mini Map center (Only in Street View mode)
                            (this.map as any).center = {lat: pos.lat(), lng: pos.lng(), altitude: 100};
                            // Update internal state without triggering full re-render loop
                            this.currentLocation = {lat: pos.lat(), lng: pos.lng()};
                            
                            // Also update avatar internal state so if we switch, we are at the right place
                            this.avatarLat = pos.lat();
                            this.avatarLng = pos.lng();
                        }
                    });
                }
            }, 0);
        } else {
            this.showPano = false;
            console.log('No 360 view found nearby');
        }
    });
  }

  private async fetchWeather() {
      if (!this.currentLocation) return;
      // If we already have data and it's showing, close it
      if (this.showWeather && this.weatherData) {
          this.showWeather = false;
          return;
      }

      const {lat, lng} = this.currentLocation;
      try {
          const response = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,is_day&temperature_unit=celsius&wind_speed_unit=kmh`
          );
          const data = await response.json();
          if (data.current) {
              this.weatherData = {
                  temperature: data.current.temperature_2m,
                  weathercode: data.current.weather_code,
                  windspeed: data.current.wind_speed_10m,
                  is_day: data.current.is_day
              };
              this.showWeather = true;
          }
      } catch (e) {
          console.error("Failed to fetch weather", e);
          // Optional: show error toast
      }
  }
  
  private getWeatherIcon(code: number): {icon: string, text: string} {
      // WMO Weather interpretation codes (ww)
      // 0: Clear sky
      // 1, 2, 3: Mainly clear, partly cloudy, and overcast
      // 45, 48: Fog
      // 51-55: Drizzle
      // 61-65: Rain
      // 71-75: Snow
      // 95: Thunderstorm
      if (code === 0) return {icon: '☀️', text: 'Clear Sky'};
      if (code <= 3) return {icon: '⛅', text: 'Partly Cloudy'};
      if (code <= 48) return {icon: '🌫️', text: 'Foggy'};
      if (code <= 57) return {icon: '🌧️', text: 'Drizzle'};
      if (code <= 67) return {icon: '🌧️', text: 'Rain'};
      if (code <= 77) return {icon: '🌨️', text: 'Snow'};
      if (code <= 86) return {icon: '🌧️', text: 'Showers'};
      if (code <= 99) return {icon: '⛈️', text: 'Thunderstorm'};
      return {icon: '🌡️', text: 'Unknown'};
  }

  private performFlyTo(lat: number, lng: number, range: number = 2000, tilt: number = 67.5) {
     if (!this.map) return;
     const cameraOptions = {
        center: {lat, lng, altitude: 0},
        heading: 0,
        tilt: tilt,
        range: range,
      };
      (this.map as any).flyCameraTo({
        endCamera: cameraOptions,
        durationMillis: 1500,
      });
  }

  private async _handleDirections(originQuery: string, destinationQuery: string) {
    if (!this.mapInitialized || !this.map || !this.directionsService) return;
    this._clearTemporaryMapElements();

    this.directionsService.route(
      {
        origin: originQuery,
        destination: destinationQuery,
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
      },
      async (response: any, status: string) => {
        if (status === 'OK' && response && response.routes && response.routes.length > 0) {
          const route = response.routes[0];

          if (route.overview_path && this.Polyline3DElement) {
            const pathCoordinates = route.overview_path.map((p: any) => ({
              lat: p.lat(),
              lng: p.lng(),
            }));
            
            // Store for simulation
            this.routePath = pathCoordinates;

            const path3d = pathCoordinates.map((p: any) => ({...p, altitude: 5}));

            this.routePolyline = new this.Polyline3DElement();
            this.routePolyline.coordinates = path3d;
            this.routePolyline.strokeColor = 'blue';
            this.routePolyline.strokeWidth = 10;
            (this.map as any).appendChild(this.routePolyline);
          }

          // Add origin/dest markers
           if (route.legs?.[0]?.start_location) {
             const loc = route.legs[0].start_location;
             this.originMarker = new this.Marker3DElement();
             this.originMarker.position = {lat: loc.lat(), lng: loc.lng(), altitude: 0};
             this.originMarker.label = 'Origin';
             (this.map as any).appendChild(this.originMarker);
           }
           if (route.legs?.[0]?.end_location) {
             const loc = route.legs[0].end_location;
             this.destinationMarker = new this.Marker3DElement();
             this.destinationMarker.position = {lat: loc.lat(), lng: loc.lng(), altitude: 0};
             this.destinationMarker.label = 'Destination';
             (this.map as any).appendChild(this.destinationMarker);
           }

          if (route.bounds) {
            const center = route.bounds.getCenter();
            this.performFlyTo(center.lat(), center.lng(), 10000, 45);
            this.currentLocation = {lat: center.lat(), lng: center.lng()};
            this.currentLocationName = `Route to ${destinationQuery}`;
            this.showWeather = false;
          }
        }
      },
    );
  }

  private async startFlyover() {
    if (!this.routePath.length || !this.map) return;
    
    // Stop Orbit if active
    if (this.isOrbiting) {
        this.isOrbiting = false;
        this.stopOrbitLoop();
    }

    this.isSimulating = true;

    // Zoom in to start
    const start = this.routePath[0];
    (this.map as any).flyCameraTo({
        endCamera: {
            center: {lat: start.lat, lng: start.lng, altitude: 100},
            tilt: 75,
            range: 500,
            heading: 0
        },
        durationMillis: 2000
    });

    await new Promise(r => setTimeout(r, 2000));

    // Sample points to fly through (too many points makes it jittery)
    const step = Math.max(1, Math.floor(this.routePath.length / 20)); // Aim for ~20 keyframes
    
    for (let i = 0; i < this.routePath.length; i += step) {
        if (!this.isSimulating) break;
        const pt = this.routePath[i];
        const nextPt = this.routePath[Math.min(i + step, this.routePath.length - 1)];
        
        // Calculate heading to next point
        const heading = (window as any).google.maps.geometry.spherical.computeHeading(pt, nextPt);

        await (this.map as any).flyCameraTo({
            endCamera: {
                center: {lat: pt.lat, lng: pt.lng, altitude: 100},
                tilt: 75,
                range: 500,
                heading: heading
            },
            durationMillis: 2000 // Smooth interpolation
        });
    }
    
    this.isSimulating = false;
  }

  private async _handleAddToBucketList(locationQuery: string, notes?: string) {
    if (!this.mapInitialized || !this.geocoder) {
       const {textElement} = this.addMessage('error', 'System');
       textElement.innerHTML = await marked.parse('Cannot add to list: Map services not ready.');
       return;
    }

    // Check if already exists
    if (this.bucketList.some(item => item.name.toLowerCase() === locationQuery.toLowerCase())) {
       // Just fly there if it exists
       this._handleViewLocation(locationQuery);
       this.selectedChatTab = ChatTab.BUCKET_LIST;
       return;
    }

    this.geocoder.geocode({address: locationQuery}, (results: any, status: string) => {
        if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            const newItem: BucketItem = {
                id: crypto.randomUUID(),
                name: locationQuery, // Use query as name for simplicity, or results[0].formatted_address
                lat: loc.lat(),
                lng: loc.lng(),
                notes: notes,
                addedAt: Date.now()
            };
            this.bucketList = [...this.bucketList, newItem]; // Trigger update
            this.selectedChatTab = ChatTab.BUCKET_LIST; // Switch tab to show user
            this.performFlyTo(loc.lat(), loc.lng());
            this._searchAndShowPano(loc.lat(), loc.lng());
            this.currentLocation = {lat: loc.lat(), lng: loc.lng()};
            this.currentLocationName = locationQuery;
            this.showWeather = false;
        } else {
            console.warn('Could not geocode for bucket list:', locationQuery);
        }
    });
  }

  private _handleRemoveFromBucketList(locationQuery: string) {
      const lowerQuery = locationQuery.toLowerCase();
      const initialLen = this.bucketList.length;
      this.bucketList = this.bucketList.filter(item => !item.name.toLowerCase().includes(lowerQuery));
      
      if (this.bucketList.length < initialLen) {
          this.selectedChatTab = ChatTab.BUCKET_LIST;
      }
  }

  private toggleExplorationMode() {
      if (!this.showPano && !this.isExplorationMode && !this.currentLocation) {
          // If no pano is visible and no location, ask user to select one
          const {textElement} = this.addMessage('assistant', 'Please select a location to explore first.');
          return;
      }

      this.isExplorationMode = !this.isExplorationMode;
      
      if (this.isExplorationMode) {
          // Reset to Street View initially
          this.isAvatarMode = false;
          
          // Trigger resize on pano to ensure it fills screen if needed
          setTimeout(() => {
              if(this.panorama) (window as any).google.maps.event.trigger(this.panorama, "resize");
          }, 100);
          
          // Init voice
          this.initSpeechRecognition();
          
          // Sync avatar position to current map center
          if(this.currentLocation) {
              this.avatarLat = this.currentLocation.lat;
              this.avatarLng = this.currentLocation.lng;
          }

          // Auto-trigger narration on enter (after brief delay to settle)
          setTimeout(() => {
              this.triggerNarration();
          }, 1500);

      } else {
          this.stopListening();
          this.isAvatarMode = false;
          this.isOrbiting = false; // Reset orbit on exit
          this.cancelSpeech();
      }
  }
  
  private toggleAvatarMode() {
      this.isAvatarMode = !this.isAvatarMode;
      // Styling changes are handled via classMap in render
      // Effect loop handled in updated()
  }

  /**
   * Handle generic map queries from the MCP server.
   */
  async handleMapQuery(params: MapParams) {
    switch (params.command) {
      case 'VIEW':
        if (params.location) this._handleViewLocation(params.location);
        break;
      case 'DIRECTIONS':
        if (params.origin && params.destination) {
            this._handleDirections(params.origin, params.destination);
        }
        break;
      case 'ADD_BUCKET':
        if (params.location) this._handleAddToBucketList(params.location, params.notes);
        break;
      case 'REMOVE_BUCKET':
         if (params.location) this._handleRemoveFromBucketList(params.location);
         break;
      case 'EXPLORE':
         if (!this.showPano) {
             // If asked to explore but no location set, just warn or try to use current location
             if (this.currentLocation) {
                 this._searchAndShowPano(this.currentLocation.lat, this.currentLocation.lng);
                 setTimeout(() => { this.toggleExplorationMode(); }, 500);
             } else {
                 // Default
                 this._handleViewLocation("Times Square, New York");
                 setTimeout(() => { this.toggleExplorationMode(); }, 2000);
             }
         } else {
             if (!this.isExplorationMode) this.toggleExplorationMode();
         }
         break;
      case 'ORBIT':
         if (!this.isOrbiting) this.toggleOrbit();
         break;
    }
  }

  private async _handleViewLocation(locationQuery: string) {
    if (!this.mapInitialized || !this.map || !this.geocoder) return;
    this._clearTemporaryMapElements();

    this.geocoder.geocode(
      {address: locationQuery},
      async (results: any, status: string) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location;
          const lat = location.lat();
          const lng = location.lng();

          this.performFlyTo(lat, lng);
          this._searchAndShowPano(lat, lng);
          this.currentLocation = {lat, lng};
          this.currentLocationName = locationQuery;
          this.showWeather = false;
          
          this.avatarLat = lat;
          this.avatarLng = lng;

          // Add temporary search marker
          this.searchMarker = new this.Marker3DElement();
          this.searchMarker.position = {lat, lng, altitude: 0};
          this.searchMarker.label = locationQuery;
          // Default red for search
          (this.map as any).appendChild(this.searchMarker);
        }
      },
    );
  }

  private _handleLocateMe() {
    if (!navigator.geolocation) {
      console.error("Geolocation not supported by browser");
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        this._clearTemporaryMapElements();
        
        // Reverse Geocode to get name
        if (this.geocoder) {
            this.geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
                if (status === 'OK' && results[0]) {
                    this.currentLocationName = results[0].formatted_address;
                } else {
                    this.currentLocationName = "My Current Location";
                }
            });
        } else {
             this.currentLocationName = "My Current Location";
        }

        // Fly to user location with closer range
        this.performFlyTo(lat, lng, 1500, 45);
        
        // Show street view/pano
        this._searchAndShowPano(lat, lng);
        
        this.currentLocation = {lat, lng};
        this.showWeather = false;
        this.avatarLat = lat;
        this.avatarLng = lng;
        
        // Add marker for "My Location"
        if (this.Marker3DElement && this.map) {
            this.searchMarker = new this.Marker3DElement();
            this.searchMarker.position = {lat, lng, altitude: 0};
            this.searchMarker.label = "My Location";
            (this.map as any).appendChild(this.searchMarker);
        }
    }, (err) => {
        console.error("Geolocation error", err);
        const {textElement} = this.addMessage('error', 'System');
        textElement.innerHTML = "Could not access location. Please check permissions.";
    });
  }

  setInputField(message: string) {
    this.inputMessage = message.trim();
  }

  addMessage(role: string, message: string) {
    const div = document.createElement('div');
    div.classList.add('turn');
    div.classList.add(`role-${role.trim()}`);
    div.setAttribute('aria-live', 'polite');

    const thinkingDetails = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Thinking process';
    thinkingDetails.classList.add('thinking');
    thinkingDetails.setAttribute('aria-label', 'Model thinking process');
    const thinkingElement = document.createElement('div');
    thinkingDetails.append(summary);
    thinkingDetails.append(thinkingElement);
    div.append(thinkingDetails);

    const textElement = document.createElement('div');
    textElement.className = 'text';
    textElement.innerHTML = message;
    div.append(textElement);

    this.messages = [...this.messages, div];
    this.scrollToTheEnd();
    return {
      thinkingContainer: thinkingDetails,
      thinkingElement: thinkingElement,
      textElement: textElement,
    };
  }

  scrollToTheEnd() {
    if (!this.anchor) return;
    this.anchor.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }

  async sendMessageAction(message?: string, role?: string) {
    if (this.chatState !== ChatState.IDLE) return;

    let msg = '';
    let usedComponentInput = false; 

    if (message) {
      msg = message.trim();
    } else {
      msg = this.inputMessage.trim();
      if (msg.length > 0) {
        this.inputMessage = '';
        usedComponentInput = true;
      } else if (
        this.inputMessage.trim().length === 0 &&
        this.inputMessage.length > 0
      ) {
        this.inputMessage = '';
        usedComponentInput = true;
      }
    }

    if (msg.length === 0) {
      if (usedComponentInput) {
        this.setNewRandomPrompt();
      }
      return;
    }

    const msgRole = role ? role.toLowerCase() : 'user';

    if (msgRole === 'user' && msg) {
      const {textElement} = this.addMessage(msgRole, '...');
      textElement.innerHTML = await marked.parse(msg);
    }

    if (this.sendMessageHandler) {
      await this.sendMessageHandler(msg, msgRole);
    }

    if (usedComponentInput) {
      this.setNewRandomPrompt();
    }
  }

  private async inputKeyDownAction(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessageAction();
    }
  }

  private removeBucketItem(id: string) {
      this.bucketList = this.bucketList.filter(item => item.id !== id);
  }

  private flyToBucketItem(item: BucketItem) {
      this.performFlyTo(item.lat, item.lng);
      this._searchAndShowPano(item.lat, item.lng);
      this.currentLocation = {lat: item.lat, lng: item.lng};
      this.currentLocationName = item.name;
      this.showWeather = false;
      this.avatarLat = item.lat;
      this.avatarLng = item.lng;
  }

  togglePanoExpand() {
      this.isPanoExpanded = !this.isPanoExpanded;
      // Resize event trigger for Pano to refill div
      setTimeout(() => {
          if(this.panorama) {
              (window as any).google.maps.event.trigger(this.panorama, "resize");
          }
      }, 350);
  }
  
  /** Virtual Exploration Mode Features */

  private setupKeyboardListeners() {
      window.addEventListener('keydown', (e) => {
          const key = e.key.toLowerCase();
          if (this.isExplorationMode) {
              this.keysPressed.add(key);
              
              // If in Street View mode (Avatar Mode off), handle keydown discretely for now
              // (Or we could move this to game loop too, but navigation is discrete in SV)
              if (!this.isAvatarMode && this.panorama) {
                  switch(key) {
                      case 'w':
                      case 'arrowup':
                          this.movePanoForward();
                          break;
                      case 's':
                      case 'arrowdown':
                          this.movePanoBackward();
                          break;
                      case 'a':
                      case 'arrowleft':
                          this.rotatePano(-10);
                          break;
                      case 'd':
                      case 'arrowright':
                          this.rotatePano(10);
                          break;
                  }
              }
          }
      });
      window.addEventListener('keyup', (e) => {
          this.keysPressed.delete(e.key.toLowerCase());
      });
  }

  private startAvatarGameLoop() {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      const loop = () => {
          this.updateAvatarState();
          this.animationFrameId = requestAnimationFrame(loop);
      };
      this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopAvatarGameLoop() {
      if (this.animationFrameId) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = undefined;
      }
  }
  
  private toggleOrbit() {
      this.isOrbiting = !this.isOrbiting;
      
      if (this.isOrbiting) {
          // Stop any conflicting simulation
          this.isSimulating = false;
          
          // If standard view (not avatar), start the dedicated loop
          if (!this.isAvatarMode) {
             this.startOrbitLoop();
          }
      } else {
          // Stop loop
          if (!this.isAvatarMode) {
             this.stopOrbitLoop();
          }
      }
      // If avatar mode, updateAvatarState handles it via isOrbiting flag check
  }
  
  private startOrbitLoop() {
      if (this.orbitFrameId) cancelAnimationFrame(this.orbitFrameId);
      const loop = () => {
          if (this.map) {
             const currentHeading = (this.map as any).heading || 0;
             (this.map as any).heading = (currentHeading + 0.5) % 360;
             
             // Slowly adjust tilt to a better viewing angle if it's too flat (e.g., < 60 degrees)
             // This ensures the user gets a view of the "surroundings" rather than just top-down
             const currentTilt = (this.map as any).tilt || 0;
             if (currentTilt < 60) {
                 (this.map as any).tilt = Math.min(currentTilt + 0.5, 60);
             }
          }
          this.orbitFrameId = requestAnimationFrame(loop);
      };
      this.orbitFrameId = requestAnimationFrame(loop);
  }

  private stopOrbitLoop() {
      if (this.orbitFrameId) {
          cancelAnimationFrame(this.orbitFrameId);
          this.orbitFrameId = undefined;
      }
  }

  private updateAvatarState() {
      if (!this.isAvatarMode || !this.map || !this.avatarModelElement) return;

      let isMoving = false;
      const speed = 0.00005; // Speed of avatar movement
      const rotationSpeed = 2; // Rotation speed

      // --- Rotation (Arrow Keys) ---
      if (this.keysPressed.has('arrowleft')) {
          this.avatarHeading -= rotationSpeed;
      }
      if (this.keysPressed.has('arrowright')) {
          this.avatarHeading += rotationSpeed;
      }

      // Normalize heading 0-360
      this.avatarHeading = (this.avatarHeading + 360) % 360;

      // --- Movement (WASD) ---
      let moveForward = 0;
      let moveStrafe = 0;

      if (this.keysPressed.has('w')) moveForward += 1;
      if (this.keysPressed.has('s')) moveForward -= 1;
      if (this.keysPressed.has('d')) moveStrafe += 1;
      if (this.keysPressed.has('a')) moveStrafe -= 1;

      if (moveForward !== 0 || moveStrafe !== 0) {
          isMoving = true;
          const rad = this.avatarHeading * Math.PI / 180;
          
          // Forward vector (Lat is cos, Lng is sin for map 0-North system)
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          
          // dLat = fwd * cos - strafe * sin
          // dLng = fwd * sin + strafe * cos
          this.avatarLat += (moveForward * cos - moveStrafe * sin) * speed;
          this.avatarLng += (moveForward * sin + moveStrafe * cos) * speed;
      }

      // Update Avatar Model Position
      this.avatarModelElement.position = {lat: this.avatarLat, lng: this.avatarLng, altitude: 0};
      this.avatarModelElement.orientation = {heading: this.avatarHeading - 90, tilt: 0, roll: 0}; // -90 correction for model

      // Animation Control
      if (isMoving) {
          if (this.avatarModelElement.getAttribute('animation-name') !== 'animation_0') {
              this.avatarModelElement.setAttribute('animation-name', 'animation_0');
          }
      } else {
          if (this.avatarModelElement.hasAttribute('animation-name')) {
              this.avatarModelElement.removeAttribute('animation-name');
          }
      }

      // --- Smooth Camera Follow ---
      const map = this.map as any;
      
      // Current Camera State (use defaults if undefined to prevent crash)
      const currentCenter = map.center || {lat: this.avatarLat, lng: this.avatarLng, altitude: 1.5};
      const currentHeading = map.heading || this.avatarHeading;

      // Target State (Avatar)
      const targetLat = this.avatarLat;
      const targetLng = this.avatarLng;
      const targetHeading = this.avatarHeading;

      // Lerp Factor (Higher = Snappier, Lower = Smoother/Laggy)
      const t = 0.1; 

      // Interpolate Position (Always follow avatar position)
      const newLat = currentCenter.lat + (targetLat - currentCenter.lat) * t;
      const newLng = currentCenter.lng + (targetLng - currentCenter.lng) * t;

      map.center = {lat: newLat, lng: newLng, altitude: 1.5};
      
      // Heading logic: Either Orbit or Follow
      if (this.isOrbiting) {
           // In orbit mode, rotate heading continuously
           map.heading = (currentHeading + 0.5) % 360;
           map.tilt = 67.5; // Slightly higher angle for orbit
           map.range = 50; // Pull back slightly
      } else {
          // Standard "Follow Behind" Logic
          let diffHeading = targetHeading - currentHeading;
          while (diffHeading > 180) diffHeading -= 360;
          while (diffHeading < -180) diffHeading += 360;
          const newHeading = currentHeading + diffHeading * t;

          map.heading = newHeading;
          map.tilt = 80; 
          map.range = 20;
      }
  }

  private movePanoForward() {
      if (!this.panorama) return;
      const links = this.panorama.getLinks();
      if (!links || links.length === 0) return;
      
      const currentHeading = this.panorama.getPov().heading;
      let bestLink = null;
      let minDiff = 360;
      
      for (const link of links) {
          let diff = Math.abs(link.heading - currentHeading);
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff && diff < 60) { // Must be roughly in front
              minDiff = diff;
              bestLink = link;
          }
      }
      
      if (bestLink) {
          this.panorama.setPano(bestLink.pano);
          // Smoothly adjust heading to face the road direction of new pano
          this.panorama.setPov({
              heading: bestLink.heading,
              pitch: 0
          });
      }
  }

  private movePanoBackward() {
       if (!this.panorama) return;
       const links = this.panorama.getLinks();
       if (!links || links.length === 0) return;
       
       const currentHeading = this.panorama.getPov().heading;
       const backHeading = (currentHeading + 180) % 360;
       
       let bestLink = null;
       let minDiff = 360;
       
       for (const link of links) {
           let diff = Math.abs(link.heading - backHeading);
           if (diff > 180) diff = 360 - diff;
           if (diff < minDiff && diff < 60) {
               minDiff = diff;
               bestLink = link;
           }
       }
       
       if (bestLink) {
           this.panorama.setPano(bestLink.pano);
       }
  }

  private rotatePano(degrees: number) {
      if (!this.panorama) return;
      const pov = this.panorama.getPov();
      this.panorama.setPov({
          heading: pov.heading + degrees,
          pitch: pov.pitch
      });
  }

  // Enhanced Street View Features
  
  private animatePanoTransition() {
      // Smooth fade-in effect for panorama transitions
      const panoElement = document.getElementById('pano');
      if (panoElement) {
          panoElement.style.opacity = '0';
          panoElement.style.transition = 'opacity 0.5s ease-in-out';
          setTimeout(() => {
              panoElement.style.opacity = '1';
          }, 50);
      }
  }

  toggleAutoRotate() {
      this.isAutoRotating = !this.isAutoRotating;
      
      if (this.isAutoRotating) {
          // Start auto-rotation: slowly rotate the view 360 degrees
          this.autoRotateIntervalId = window.setInterval(() => {
              if (this.panorama && this.isAutoRotating) {
                  const pov = this.panorama.getPov();
                  this.panorama.setPov({
                      heading: (pov.heading + 0.5) % 360, // Slow rotation
                      pitch: pov.pitch
                  });
              }
          }, 50); // Update every 50ms for smooth rotation
      } else {
          // Stop auto-rotation
          if (this.autoRotateIntervalId) {
              clearInterval(this.autoRotateIntervalId);
              this.autoRotateIntervalId = undefined;
          }
      }
  }

  toggleAutoTour() {
      this.isAutoTour = !this.isAutoTour;
      
      if (this.isAutoTour) {
          // Start auto-tour: automatically move forward every few seconds
          this.autoTourIntervalId = window.setInterval(() => {
              if (this.panorama && this.isAutoTour) {
                  this.movePanoForward();
              }
          }, 5000); // Move forward every 5 seconds
      } else {
          // Stop auto-tour
          if (this.autoTourIntervalId) {
              clearInterval(this.autoTourIntervalId);
              this.autoTourIntervalId = undefined;
          }
      }
  }

  toggleAmbientSound() {
      this.ambientSoundEnabled = !this.ambientSoundEnabled;
      
      if (this.ambientSoundEnabled) {
          // Play ambient city sounds
          if (!this.ambientAudio) {
              this.ambientAudio = new Audio();
              // Using a free ambient sound (you can replace with better sources)
              this.ambientAudio.src = 'https://assets.mixkit.co/active_storage/sfx/2523/2523-preview.mp3';
              this.ambientAudio.loop = true;
              this.ambientAudio.volume = 0.3;
          }
          this.ambientAudio.play().catch(e => console.log('Audio play failed:', e));
      } else {
          // Stop ambient sounds
          if (this.ambientAudio) {
              this.ambientAudio.pause();
              this.ambientAudio.currentTime = 0;
          }
      }
  }

  // Speech Recognition
  private initSpeechRecognition() {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = false; // Better for short commands
          this.recognition.lang = 'en-US';
          this.recognition.interimResults = false;
          
          this.recognition.onresult = (event: any) => {
             const transcript = event.results[0][0].transcript.toLowerCase();
             this.voiceTranscript = transcript;
             setTimeout(() => { this.voiceTranscript = ''; }, 3000);
             this.handleVoiceCommand(transcript);
             this.isListening = false;
          };
          
          this.recognition.onend = () => {
              this.isListening = false;
          };
          
          this.recognition.onerror = (event: any) => {
              console.error("Speech error", event.error);
              this.isListening = false;
          };
      }
  }

  private toggleListening() {
      if (!this.recognition) {
          this.initSpeechRecognition();
      }
      
      if (this.isListening) {
          this.recognition.stop();
      } else {
          try {
            this.recognition.start();
            this.isListening = true;
          } catch(e) {
             console.error("Failed to start recognition", e); 
          }
      }
  }
  
  private stopListening() {
      if (this.isListening && this.recognition) {
          this.recognition.stop();
          this.isListening = false;
      }
  }
  
  /**
   * Speech Synthesis / Narration
   */
  speak(text: string) {
      this.cancelSpeech();
      // Basic markdown stripping to prevent reading symbols
      const cleanText = text.replace(/[*#_`\[\]()]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      utterance.onstart = () => this.isSpeaking = true;
      utterance.onend = () => this.isSpeaking = false;
      utterance.onerror = () => this.isSpeaking = false;
      
      window.speechSynthesis.speak(utterance);
  }

  cancelSpeech() {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
  }

  toggleSpeech() {
      if (this.isSpeaking) {
          this.cancelSpeech();
      } else {
          this.triggerNarration();
      }
  }

  triggerNarration() {
      if (!this.currentLocationName) return;
      
      this.shouldSpeakNextResponse = true;
      const context = this.currentLocationName;
      const prompt = `I am exploring ${context}. Act as a virtual tour guide. Describe the surroundings, provide historical facts, and suggest nearby points of interest. Keep it spoken-style and engaging.`;
      
      this.sendMessageAction(prompt, 'user');
  }

  private handleVoiceCommand(command: string) {
      if (command.includes('forward') || command.includes('walk') || command.includes('go')) {
          this.isAvatarMode ? this.keysPressed.add('w') : this.movePanoForward();
          // Auto release key after 2 seconds for voice
          setTimeout(() => this.keysPressed.delete('w'), 2000);
      } else if (command.includes('backward') || command.includes('back')) {
          this.isAvatarMode ? this.keysPressed.add('s') : this.movePanoBackward();
          setTimeout(() => this.keysPressed.delete('s'), 2000);
      } else if (command.includes('left')) {
           this.isAvatarMode ? this.keysPressed.add('a') : this.rotatePano(-45);
           setTimeout(() => this.keysPressed.delete('a'), 1000);
      } else if (command.includes('right')) {
          this.isAvatarMode ? this.keysPressed.add('d') : this.rotatePano(45);
          setTimeout(() => this.keysPressed.delete('d'), 1000);
      } else if (command.includes('exit') || command.includes('stop exploring')) {
          this.toggleExplorationMode();
      } else if (command.includes('avatar') || command.includes('person') || command.includes('third person')) {
          if (!this.isAvatarMode) this.toggleAvatarMode();
      } else if (command.includes('first person') || command.includes('street view')) {
          if (this.isAvatarMode) this.toggleAvatarMode();
      } else if (command.includes('spin') || command.includes('orbit') || command.includes('360')) {
          this.toggleOrbit();
      } else if (command.includes('narrate') || command.includes('guide me') || command.includes('tell me about')) {
          this.triggerNarration();
      } else if (command.includes('stop speaking') || command.includes('quiet')) {
          this.cancelSpeech();
      } else {
          // Treat as complex AI query (e.g. "What is that building?")
          // If in exploration mode, speak the result
          if (this.isExplorationMode) {
              this.shouldSpeakNextResponse = true;
          }
          this.sendMessageAction(command, 'user');
      }
  }

  render() {
    const initialCenter = '0,0,100'; 
    const initialRange = '20000000'; 
    const initialTilt = '45'; 
    const initialHeading = '0';

    return html`<div class="gdm-map-app ${classMap({'exploration-active': this.isExplorationMode, 'avatar-mode': this.isAvatarMode})}">
      <div
        class="main-container"
        role="application"
        aria-label="Interactive Map Area">
        ${this.mapError
          ? html`<div
              class="map-error-message"
              role="alert"
              aria-live="assertive"
              >${this.mapError}</div
            >`
          : ''}
        <gmp-map-3d
          id="mapContainer"
          style="height: 100%; width: 100%;"
          aria-label="Google Photorealistic 3D Map Display"
          mode="hybrid"
          center="${initialCenter}"
          heading="${initialHeading}"
          tilt="${initialTilt}"
          range="${initialRange}"
          internal-usage-attribution-ids="gmp_aistudio_threedmapjsmcp_v0.1_showcase"
          default-ui-disabled="true"
          role="application">
          
          ${this.isAvatarMode && this.Model3DElement 
              ? html`<gmp-model-3d 
                        id="avatarModel"
                        src="https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb"
                        scale="2"
                        altitude-mode="clamp-to-ground"
                     ></gmp-model-3d>`
              : ''
          }

        </gmp-map-3d>

        <!-- Location Overlay Card -->
        ${this.currentLocationName
            ? html`<div id="location-card">
                    <span class="location-name">${this.currentLocationName}</span>
                    <button @click=${() => this._handleAddToBucketList(this.currentLocationName!)}>
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                        Add
                    </button>
                    ${this.showPano && !this.isExplorationMode 
                       ? html`<button @click=${() => this.toggleExplorationMode()} title="Start Walking">
                                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-80 200-640l60-20 80 200h40l-60-420 200-40 120 360-240 480Zm108-542 64 204-28 54-54-174 18-84Zm-82-322 18 144-32 64-22-166 36-42Z"/></svg>
                                Explore
                              </button>` 
                       : ''}
                   </div>`
            : ''
        }

        <!-- Locate Me Button -->
        <button id="locate-btn" @click=${() => this._handleLocateMe()} title="Locate Me">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 240q100 0 170-70t70-170q0-100-70-170t-170-70q-100 0-170 70t-70 170q0 100 70 170t170 70Zm0-80q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Z"/></svg>
        </button>

        <!-- Weather Button -->
        ${this.currentLocation 
            ? html`<button id="weather-btn" @click=${() => this.fetchWeather()} title="Weather Forecast">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240q0-33 23.5-56.5T160-320h50v-40q0-83 58.5-141.5T410-560q69 0 121.5 40t69.5 106q40-12 80 6.5t62 51.5q22 33 21.5 74.5T741-209q-23 24-53.5 36.5T624-160H160Zm0-80h464q18 0 31-11.5t16-28.5q3-17-5.5-32.5T643-335q-15-8-31-6t-30 13l-12 12v-44q0-50-35-85t-85-35q-50 0-85 35t-35 85v40h-20q-17 0-28.5 11.5T270-280q0 17 11.5 28.5T310-240h-10q-17 0-28.5 11.5T260-200q0 17 11.5 28.5T300-160h-60q-17 0-28.5 11.5T200-120h-40Z"/><path d="M450-600v-200h60v200h-60Zm265 56-42-42 142-142 42 42-142 142ZM203-402l-42-42 142-142 42 42-142 142Z"/></svg>
                   </button>`
            : ''
        }

        <!-- Orbit Button (New) -->
        <button id="orbit-btn" 
                class=${classMap({active: this.isOrbiting})}
                @click=${() => this.toggleOrbit()} 
                title="360° Orbit View">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-160q-133 0-226.5-93.5T160-480q0-133 93.5-226.5T480-800q84 0 149.5 34.5T743-675l58-58q-45-45-110-76t-131-31q-166 0-283 117t-117 283q0 166 117 283t283 117q138 0 245-81.5T843-440h-82q-29 88-104 144t-177 56Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm320-365v-155h-60v155L625-680l-40 40 185 185 185-185-40-40-115 115Z"/></svg>
        </button>
        
        ${this.showWeather && this.weatherData
            ? html`<div id="weather-card">
                    <div class="weather-temp">
                        <span>${this.getWeatherIcon(this.weatherData.weathercode).icon}</span>
                        <span>${this.weatherData.temperature}°C</span>
                    </div>
                    <div class="weather-desc">
                        ${this.getWeatherIcon(this.weatherData.weathercode).text}
                    </div>
                    <div class="weather-wind">
                        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M160-280v-80h440v80H160Zm0-160v-80h440v80H160Zm0-160v-80h280v80H160Zm512 402-58-56 128-126H480v-80h262L614-586l58-56 224 222-224 222Z"/></svg>
                        ${this.weatherData.windspeed} km/h Wind
                    </div>
                   </div>`
            : ''
        }

        ${this.routePath.length > 0 && !this.isSimulating && !this.isExplorationMode
            ? html`<button id="fly-route-btn" @click=${() => this.startFlyover()}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>
                    Start Flyover
                   </button>`
            : ''
        }

        <!-- PANO OVERLAY -->
        <div id="pano-card" class=${classMap({'visible': this.showPano, 'expanded': this.isPanoExpanded})}>
            <div class="pano-header">
                <span>Virtual Preview</span>
                <div class="pano-controls">
                    <button class="pano-btn" @click=${() => this.togglePanoExpand()} title="${this.isPanoExpanded ? 'Minimize' : 'Expand'}">
                         ${this.isPanoExpanded 
                            ? html`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M440-440v240h-80v-160H200v-80h240Zm160-320v160h160v80H520v-240h80Z"/></svg>`
                            : html`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M120-120v-320h80v184l504-504H520v-80h320v320h-80v-184L256-200h184v80H120Z"/></svg>`
                         }
                    </button>
                    <button class="pano-btn" @click=${() => this.showPano = false} title="Close Preview">
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </button>
                </div>
            </div>
            <div id="pano"></div>
        </div>
        
        <!-- Exploration Mode Overlays -->
        ${this.isExplorationMode ? html`
            <button id="exit-explore-btn" @click=${() => this.toggleExplorationMode()}>
                Exit Exploration
            </button>
            
            <button id="toggle-view-btn" @click=${() => this.toggleAvatarMode()} title="Switch View">
                 ${this.isAvatarMode 
                    ? html`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-80 200-640l60-20 80 200h40l-60-420 200-40 120 360-240 480Zm108-542 64 204-28 54-54-174 18-84Zm-82-322 18 144-32 64-22-166 36-42Z"/></svg> Switch to Street View` 
                    : html`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-32q0-34 17.5-62.5T224-304q55-27 109.5-41.5T480-360q58 0 113.5 15T736-304q29 15 46.5 43.5T800-192v32h-80v-32q0-11-5.5-20T700-228q-54-28-109-40t-111-12q-56 0-111 12t-109 40q-9 5-14.5 14T240-192v32h-80Z"/></svg> Switch to 3D Avatar`
                 }
            </button>

            <!-- Enhanced Street View Controls -->
            <div id="enhanced-controls">
                <button class="enhance-btn" 
                        @click=${() => this.toggleAutoRotate()}
                        class=${classMap({'active': this.isAutoRotating})}
                        title="Auto-Rotate View">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"/></svg>
                    ${this.isAutoRotating ? 'Stop Rotate' : 'Auto-Rotate'}
                </button>
                
                <button class="enhance-btn" 
                        @click=${() => this.toggleAutoTour()}
                        class=${classMap({'active': this.isAutoTour})}
                        title="Auto-Tour Mode">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="m600-200-57-56 184-184H120v-80h607L543-704l57-56 280 280-280 280Z"/></svg>
                    ${this.isAutoTour ? 'Stop Tour' : 'Auto-Tour'}
                </button>
                
                <button class="enhance-btn" 
                        @click=${() => this.toggleAmbientSound()}
                        class=${classMap({'active': this.ambientSoundEnabled})}
                        title="Ambient Sounds">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320ZM400-606l-86 86H200v80h114l86 86v-252ZM300-480Z"/></svg>
                    ${this.ambientSoundEnabled ? 'Sound Off' : 'Ambient Sound'}
                </button>
            </div>

            <button id="narrate-btn" 
                    class=${classMap({'speaking': this.isSpeaking})}
                    @click=${() => this.toggleSpeech()}
                    title="Narrate Surroundings">
                 ${this.isSpeaking 
                    ? html`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-80 280-280H120v-400h160l200-200v800ZM360-666 246-560H200v240h46l114 106v-452Zm160 186v-240q58 15 99 64.5t41 115.5q0 66-41 115.5T520-480Z"/></svg> Stop Speaking`
                    : html`<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-80 280-280H120v-400h160l200-200v800Zm80-240v-80q83 0 141.5-58.5T760-600v-80h80v80q0 116-82 198t-198 82Zm0-160v-80q50 0 85-35t35-85v-80h80v80q0 83-58.5 141.5T560-480Z"/></svg> Narrate`
                 }
            </button>
            
            <button id="voice-btn" 
                    class=${classMap({'listening': this.isListening})} 
                    @click=${() => this.toggleListening()}
                    title="Voice Command (e.g., 'Walk forward', 'Orbit')">
                ${this.isListening 
                   ? html`<svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor"><path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Z"/></svg>`
                   : html`<svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor"><path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Z"/></svg>`
                }
            </button>
            
            ${this.voiceTranscript ? html`<div id="voice-transcript">${this.voiceTranscript}</div>` : ''}

            <div id="exploration-controls">
                 <div class="key-guide">
                    <div class="key-box">W</div>
                    <div class="key-row">
                        <div class="key-box">A</div>
                        <div class="key-box">S</div>
                        <div class="key-box">D</div>
                    </div>
                 </div>
                 
                 <!-- Divider -->
                 <div style="width: 1px; height: 40px; background: rgba(255,255,255,0.3); margin: 0 10px;"></div>

                 <!-- Arrow Keys -->
                 <div class="key-guide" style="justify-content: flex-end;">
                    <div class="key-row">
                        <div class="key-box">←</div>
                        <div class="key-box">→</div>
                    </div>
                 </div>
            </div>
        ` : ''}

      </div>
      <div class="sidebar" role="complementary" aria-labelledby="chat-heading">
        <div class="selector" role="tablist" aria-label="App Modes">
          <button
            id="geminiTab"
            role="tab"
            aria-selected=${this.selectedChatTab === ChatTab.GEMINI}
            class=${classMap({
              'selected-tab': this.selectedChatTab === ChatTab.GEMINI,
            })}
            @click=${() => {
              this.selectedChatTab = ChatTab.GEMINI;
            }}>
            <span id="chat-heading">Travel Agent</span>
          </button>
          <button
            id="bucketListTab"
            role="tab"
            aria-selected=${this.selectedChatTab === ChatTab.BUCKET_LIST}
            class=${classMap({
              'selected-tab': this.selectedChatTab === ChatTab.BUCKET_LIST,
            })}
            @click=${() => {
              this.selectedChatTab = ChatTab.BUCKET_LIST;
            }}>
            <span>My Bucket List (${this.bucketList.length})</span>
          </button>
        </div>

        <!-- CHAT PANEL -->
        <div
          id="chat-panel"
          role="tabpanel"
          class=${classMap({
            'tabcontent': true,
            'showtab': this.selectedChatTab === ChatTab.GEMINI,
          })}>
          <div class="chat-messages" aria-live="polite" aria-atomic="false">
            ${this.messages}
            <div id="anchor"></div>
          </div>
          <div class="footer">
            <div
              id="chatStatus"
              aria-live="assertive"
              class=${classMap({'hidden': this.chatState === ChatState.IDLE})}>
              ${this.chatState !== ChatState.IDLE
                ? html`${ICON_BUSY} ${this.chatState === ChatState.GENERATING ? 'Generating...' : 'Thinking...'}`
                : ''}
            </div>
            <div
              id="inputArea"
              role="form">
              <input
                type="text"
                id="messageInput"
                .value=${this.inputMessage}
                @input=${(e: InputEvent) => {
                  this.inputMessage = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  this.inputKeyDownAction(e);
                }}
                placeholder="Start planning your trip..."
                autocomplete="off" />
              <button
                id="sendButton"
                @click=${() => {
                  this.sendMessageAction();
                }}
                ?disabled=${this.chatState !== ChatState.IDLE}
                class=${classMap({
                  'disabled': this.chatState !== ChatState.IDLE,
                })}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="30px"
                  viewBox="0 -960 960 960"
                  width="30px"
                  fill="currentColor">
                  <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- BUCKET LIST PANEL -->
        <div
            id="bucket-list-panel"
            role="tabpanel"
            class=${classMap({
              'tabcontent': true,
              'showtab': this.selectedChatTab === ChatTab.BUCKET_LIST,
            })}
            style="overflow-y: auto; padding: 1rem; gap: 1rem; display: flex; flex-direction: column;">
            
            ${this.bucketList.length === 0 
                ? html`<div style="text-align:center; padding: 2rem; color: var(--color-text2);">
                        <h3>Your list is empty</h3>
                        <p>Tell the AI to "Add [Place] to my bucket list"!</p>
                       </div>`
                : this.bucketList.map(item => html`
                    <div class="bucket-card">
                        <div class="bucket-info">
                            <div class="bucket-name">${item.name}</div>
                            ${item.notes ? html`<div class="bucket-notes">${item.notes}</div>` : ''}
                        </div>
                        <div class="bucket-actions">
                            <button @click=${() => this.flyToBucketItem(item)} title="Fly to Preview">
                                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-200Z"/></svg>
                            </button>
                            <button @click=${() => this.removeBucketItem(item.id)} title="Remove">
                                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
                            </button>
                        </div>
                    </div>
                `)
            }
        </div>
      </div>
    </div>`;
  }
}
