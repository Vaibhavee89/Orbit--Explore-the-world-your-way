<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🌍 Orbit - Explore the World Your Way

**An AI-powered 3D travel companion with immersive exploration, smart trip planning, and bucket list management**

[![Made with Google Maps](https://img.shields.io/badge/Google%20Maps-3D%20API-4285F4?style=for-the-badge&logo=google-maps)](https://developers.google.com/maps)
[![Powered by Gemini](https://img.shields.io/badge/Gemini-AI-8E75B2?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![Built with Lit](https://img.shields.io/badge/Lit-3.0-324FFF?style=for-the-badge&logo=lit)](https://lit.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

[View Demo](https://ai.studio/apps/drive/1YOy6IA2Gs7NH0bn9G_E860EmlH5XCY35) • [Report Bug](https://github.com/Vaibhavee89/Orbit--Explore-the-world-your-way/issues) • [Request Feature](https://github.com/Vaibhavee89/Orbit--Explore-the-world-your-way/issues)

</div>

---

## ✨ Features

### 🗺️ **Immersive 3D Exploration**
- **Photorealistic 3D Maps**: Explore the world with Google's stunning 3D imagery
- **Street View Integration**: Seamlessly switch to ground-level 360° panoramic views
- **Night Mode**: Experience locations in atmospheric nighttime lighting
- **360° Orbit View**: Automated camera rotation for cinematic location previews
- **3D Avatar Mode**: Walk around locations with a customizable 3D character

### 🎒 **Smart Bucket List**
- **Location Tracking**: Save and organize places you want to visit
- **Weather Integration**: Real-time weather data for each destination
- **Travel Budget Estimator**: Automatic cost calculations for 5-day trips
  - ✈️ Flight costs
  - 🏨 Accommodation estimates
  - 🍽️ Food budgets
  - 🎭 Activity expenses
- **Rating System**: Rate destinations with 5-star reviews
- **Visit Tracking**: Mark places as visited with visual badges
- **Virtual Tours**: One-click Street View exploration

### 🧭 **AI-Powered Trip Planner**
- **Multi-Destination Planning**: Select multiple locations from your bucket list
- **Smart Route Optimization**:
  - ⚡ **Fastest Route**: Minimizes travel time using nearest neighbor algorithm
  - 💰 **Cheapest Route**: Optimizes for lowest cost
  - ⚖️ **Balanced**: Best of both worlds
- **5 Transport Modes**:
  - 🚗 Driving (with real road routes)
  - 🚌 Public Transit
  - 🚶 Walking
  - 🚴 Bicycling
  - ✈️ Flight (direct air routes)
- **Detailed Itineraries**: Step-by-step route breakdown with:
  - Distance per segment
  - Duration estimates
  - Cost calculations
  - Visual route on 3D map

### 🤖 **AI Assistant (Gemini)**
- **Natural Language Interaction**: Chat with AI to explore the world
- **Intelligent Suggestions**: Get personalized travel recommendations
- **Voice Commands**: Speak to navigate and add locations
- **Context-Aware**: Remembers your preferences and bucket list

### 🎮 **Interactive Controls**
- **Keyboard Navigation**: WASD controls in avatar mode
- **Voice Recognition**: Hands-free exploration
- **Auto-Tour**: Automated journey through your bucket list
- **Ambient Sounds**: Immersive audio atmosphere

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **Google Maps API Key** with the following APIs enabled:
  - Maps JavaScript API
  - Geocoding API
  - Directions API
  - Street View API
- **Gemini API Key** from [Google AI Studio](https://ai.google.dev/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Vaibhavee89/Orbit--Explore-the-world-your-way.git
   cd "Orbit- Explore the world your way/mcp-maps-3d"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:5173` (or the port shown in terminal)

---

## 📖 Usage Guide

### Adding Locations to Bucket List

**Method 1: AI Chat**
```
"Add the Eiffel Tower to my bucket list"
"I want to visit Santorini, Greece"
"Save the Grand Canyon for later"
```

**Method 2: Search & Click**
1. Search for a location in the chat
2. Click the "Add" button on the location card

### Planning a Trip

1. **Select Destinations**: Check the boxes next to 2+ bucket list items
2. **Open Trip Planner**: Click "🗺️ Plan Trip" button
3. **Choose Options**:
   - Select transport mode (driving, flight, etc.)
   - Pick optimization strategy (fastest, cheapest, balanced)
4. **Calculate**: Click "🧭 Calculate Route"
5. **View Results**: See your optimized itinerary with costs and times

### Exploring in Street View

1. Click on any location to view it on the map
2. Click the "Explore" button when Street View is available
3. Use WASD keys or click-drag to navigate
4. Switch to 3D Avatar mode for a character-based experience

### Using Night Mode

- Click the sun/moon button in the top-right corner
- Works in both 3D map and Street View modes
- Creates atmospheric nighttime lighting

---

## 🏗️ Architecture

### Tech Stack

- **Frontend Framework**: [Lit](https://lit.dev/) (Web Components)
- **Language**: TypeScript
- **3D Rendering**: Google Maps 3D API
- **AI Integration**: Google Gemini API
- **Build Tool**: Vite
- **Styling**: CSS with CSS Variables for theming

### Project Structure

```
mcp-maps-3d/
├── map_app.ts          # Main application component
├── mcp_maps_server.ts  # MCP server for AI integration
├── index.tsx           # Application entry point
├── index.css           # Global styles
├── .env                # Environment variables
└── package.json        # Dependencies
```

### Key Components

- **MapApp**: Main LitElement component managing state and UI
- **Bucket List Manager**: Handles destination storage and enrichment
- **Trip Planner**: Route optimization and cost calculation
- **AI Integration**: Gemini-powered natural language processing
- **3D Map Controller**: Google Maps 3D API wrapper

---

## 🎨 Features Deep Dive

### Route Optimization Algorithms

**Nearest Neighbor (Fastest/Balanced)**
```typescript
// Greedy algorithm: always pick closest unvisited destination
1. Start at first destination
2. Find nearest unvisited location
3. Move there and repeat
4. Continue until all visited
```

**Cost Optimization (Cheapest)**
```typescript
// Prioritizes shortest distances as proxy for cost
- Same algorithm as nearest neighbor
- Cost calculated based on transport mode:
  • Driving: $0.50/km
  • Transit: $0.20/km
  • Flight: $100 + $0.15/km
```

### Budget Estimation Logic

Destinations are categorized by region:
- **Premium** (Paris, London, Tokyo): Higher costs
- **Budget** (Bali, Thailand, Vietnam): Lower costs
- **Mid-Range** (NYC, SF, Dubai): Moderate costs

Formula: `Flight + (Accommodation × nights) + (Food × days) + (Activities × days)`

---

## 🌐 API Integration

### Google Maps APIs Used

1. **Maps JavaScript API**: 3D map rendering
2. **Geocoding API**: Location search and coordinates
3. **Directions API**: Route calculation between destinations
4. **Street View API**: 360° panoramic imagery

### External APIs

- **Open-Meteo**: Free weather data (no API key required)
- **Google Gemini**: AI-powered chat and suggestions

---

## 🎯 Roadmap

- [ ] Photo gallery integration for destinations
- [ ] Social sharing of bucket lists
- [ ] Multi-day trip planning with accommodations
- [ ] Offline mode with cached data
- [ ] Mobile app (React Native)
- [ ] Collaborative trip planning
- [ ] Integration with booking platforms
- [ ] AR navigation features

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the Apache 2.0 License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **Google Maps Platform** for incredible 3D mapping technology
- **Google Gemini** for powerful AI capabilities
- **Open-Meteo** for free weather data
- **Lit** for elegant web components
- **The open-source community** for inspiration and tools

---

## 📧 Contact

**Vaibhavee** - [@Vaibhavee89](https://github.com/Vaibhavee89)

Project Link: [https://github.com/Vaibhavee89/Orbit--Explore-the-world-your-way](https://github.com/Vaibhavee89/Orbit--Explore-the-world-your-way)

---

<div align="center">

**Made with ❤️ and ☕ by Vaibhavee**

⭐ Star this repo if you find it helpful!

</div>
