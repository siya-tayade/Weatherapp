// CONFIGURATION
// using Open-Meteo API (No API Key Required)
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// DOM Elements
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const locationBtn = document.getElementById('location-btn');
const unitToggle = document.getElementById('unit-toggle');
const themeToggle = document.getElementById('theme-toggle');
const favoritesList = document.getElementById('favorites-list');
const addFavBtn = document.getElementById('add-fav-btn');
const loader = document.getElementById('loader');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

// Weather Display Elements
const cityNameEl = document.getElementById('city-name');
const dateTimeEl = document.getElementById('date-time');
const tempEl = document.getElementById('temperature');
const conditionEl = document.getElementById('condition');
const iconEl = document.getElementById('weather-icon');
const humidityEl = document.getElementById('humidity');
const windEl = document.getElementById('wind-speed');
const feelsLikeEl = document.getElementById('feels-like');
const visibilityEl = document.getElementById('visibility');
const forecastContainer = document.getElementById('forecast-container');

// State
let currentUnit = 'metric'; // 'metric' (C) or 'imperial' (F)
let currentCity = '';
let currentLat = 0;
let currentLon = 0;
let favorites = JSON.parse(localStorage.getItem('weatherFavs')) || [];
let isDarkMode = localStorage.getItem('theme') === 'dark';

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    renderFavorites();
    
    // Try to get user location on load
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                getWeatherByCoords(latitude, longitude);
            },
            (error) => {
                // Fallback to default city if permission denied (New Delhi for India context)
                getWeather('New Delhi');
            }
        );
    } else {
        getWeather('New Delhi');
    }
});

// --- API FUNCTIONS ---

async function getWeather(city) {
    showLoader(true);
    hideError();

    try {
        // 1. Geocoding: Get Lat/Lon from City Name
        const geoRes = await fetch(`${GEO_URL}?name=${city}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error('City not found');
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        currentCity = name;
        currentLat = latitude;
        currentLon = longitude;

        // 2. Fetch Weather Data
        await fetchWeatherData(latitude, longitude, name, country);
        updateFavBtnState();

    } catch (error) {
        showError(error.message);
    } finally {
        showLoader(false);
    }
}

async function getWeatherByCoords(lat, lon) {
    showLoader(true);
    hideError();

    try {
        // Reverse Geocoding not directly supported by Open-Meteo free geocoding API easily for city name, 
        // but we can just fetch weather and display "My Location" or try to infer.
        // For better UX, we'll fetch weather and use a generic name if reverse geo isn't available,
        // OR we can use a free reverse geo API like BigDataCloud or OpenStreetMap (Nominatim).
        // For simplicity and speed, we will just use the weather data and label it "Your Location" or try to find nearest city via Open-Meteo Geocoding (it doesn't do reverse).
        
        // Let's use a trick: Fetch weather, and usually we just display coordinates or "Local Weather".
        // But the user wants "All places in India". 
        // Let's use OpenStreetMap Nominatim for Reverse Geocoding (Free, no key)
        
        let locationName = "Your Location";
        let countryName = "";

        try {
            const revGeoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const revGeoData = await revGeoRes.json();
            if (revGeoData && revGeoData.address) {
                locationName = revGeoData.address.city || revGeoData.address.town || revGeoData.address.village || "Your Location";
                countryName = revGeoData.address.country || "";
            }
        } catch (e) {
            console.warn("Reverse geocoding failed", e);
        }

        currentCity = locationName;
        currentLat = lat;
        currentLon = lon;
        
        await fetchWeatherData(lat, lon, locationName, countryName);
        updateFavBtnState();

    } catch (error) {
        showError(error.message);
    } finally {
        showLoader(false);
    }
}

async function fetchWeatherData(lat, lon, cityName, countryName) {
    const unitParam = currentUnit === 'metric' ? '' : '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch';
    
    const weatherRes = await fetch(
        `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto${unitParam}`
    );
    
    const weatherData = await weatherRes.json();
    updateUI(weatherData, cityName, countryName);
}

// --- UI UPDATE FUNCTIONS ---

function updateUI(data, cityName, countryName) {
    const current = data.current;
    const daily = data.daily;

    // 1. Update Current Weather
    cityNameEl.textContent = countryName ? `${cityName}, ${countryName}` : cityName;
    dateTimeEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const temp = Math.round(current.temperature_2m);
    tempEl.textContent = `${temp}°`;
    
    const weatherInfo = getWeatherInfo(current.weather_code, current.is_day);
    conditionEl.textContent = weatherInfo.description;
    
    // Using FontAwesome icons instead of images for better scaling/color
    // Or external icon set. Let's use the external PNGs from OWM as fallback or custom logic.
    // For now, let's use the OWM icons mapping based on WMO code for visual consistency with previous request
    iconEl.src = weatherInfo.image; 
    iconEl.classList.remove('hidden');

    humidityEl.textContent = `${current.relative_humidity_2m}%`;
    
    const windSpeedUnit = currentUnit === 'metric' ? 'km/h' : 'mph';
    windEl.textContent = `${Math.round(current.wind_speed_10m)} ${windSpeedUnit}`;
    
    feelsLikeEl.textContent = `${Math.round(current.apparent_temperature)}°`;
    
    // Visibility is in meters
    const visibilityKm = (current.visibility / 1000).toFixed(1);
    visibilityEl.textContent = `${visibilityKm} km`;

    // 2. Update Forecast
    forecastContainer.innerHTML = '';
    // Open-Meteo returns 7 days usually. We take 5.
    for(let i = 0; i < 5; i++) {
        const dateStr = daily.time[i];
        const date = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);
        const code = daily.weather_code[i];
        const info = getWeatherInfo(code, 1); // Assume day icon for forecast

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <h4>${date}</h4>
            <img src="${info.image}" alt="icon">
            <div class="forecast-temp">
                <span class="max">${maxTemp}°</span>
                <span class="min">${minTemp}°</span>
            </div>
        `;
        forecastContainer.appendChild(card);
    }
}

// Helper: Map WMO Weather Codes to Description & Icons
function getWeatherInfo(code, isDay) {
    // Icons from OpenWeatherMap (using mapping)
    // 0: Clear
    // 1,2,3: Cloudy
    // 45,48: Fog
    // 51-55: Drizzle
    // 61-67: Rain
    // 71-77: Snow
    // 80-82: Showers
    // 95-99: Thunderstorm
    
    const suffix = isDay ? 'd' : 'n';
    
    if (code === 0) return { description: 'Clear Sky', image: `https://openweathermap.org/img/wn/01${suffix}@4x.png` };
    if (code === 1) return { description: 'Mainly Clear', image: `https://openweathermap.org/img/wn/02${suffix}@4x.png` };
    if (code === 2) return { description: 'Partly Cloudy', image: `https://openweathermap.org/img/wn/03${suffix}@4x.png` };
    if (code === 3) return { description: 'Overcast', image: `https://openweathermap.org/img/wn/04${suffix}@4x.png` };
    if (code >= 45 && code <= 48) return { description: 'Fog', image: `https://openweathermap.org/img/wn/50${suffix}@4x.png` };
    if (code >= 51 && code <= 57) return { description: 'Drizzle', image: `https://openweathermap.org/img/wn/09${suffix}@4x.png` };
    if (code >= 61 && code <= 67) return { description: 'Rain', image: `https://openweathermap.org/img/wn/10${suffix}@4x.png` };
    if (code >= 71 && code <= 77) return { description: 'Snow', image: `https://openweathermap.org/img/wn/13${suffix}@4x.png` };
    if (code >= 80 && code <= 82) return { description: 'Rain Showers', image: `https://openweathermap.org/img/wn/09${suffix}@4x.png` };
    if (code >= 95 && code <= 99) return { description: 'Thunderstorm', image: `https://openweathermap.org/img/wn/11${suffix}@4x.png` };
    
    return { description: 'Unknown', image: `https://openweathermap.org/img/wn/03${suffix}@4x.png` };
}

// --- FAVORITES SYSTEM ---

function renderFavorites() {
    favoritesList.innerHTML = '';
    
    if (favorites.length === 0) {
        favoritesList.innerHTML = '<li class="empty-msg">No favorites added yet.</li>';
        return;
    }

    favorites.forEach(city => {
        const li = document.createElement('li');
        li.className = 'fav-item';
        li.innerHTML = `
            <span onclick="getWeather('${city}')">${city}</span>
            <button class="delete-btn" onclick="removeFavorite('${city}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        favoritesList.appendChild(li);
    });
}

function toggleFavorite() {
    if (!currentCity) return;

    if (favorites.includes(currentCity)) {
        removeFavorite(currentCity);
    } else {
        favorites.push(currentCity);
        localStorage.setItem('weatherFavs', JSON.stringify(favorites));
        renderFavorites();
        updateFavBtnState();
    }
}

function removeFavorite(city) {
    favorites = favorites.filter(fav => fav !== city);
    localStorage.setItem('weatherFavs', JSON.stringify(favorites));
    renderFavorites();
    updateFavBtnState();
}

function updateFavBtnState() {
    if (favorites.includes(currentCity)) {
        addFavBtn.classList.add('active');
        addFavBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
    } else {
        addFavBtn.classList.remove('active');
        addFavBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    }
}

// --- UTILS & EVENTS ---

function showLoader(show) {
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

function showError(msg) {
    errorText.textContent = msg;
    errorMsg.classList.remove('hidden');
}

function hideError() {
    errorMsg.classList.add('hidden');
}

// Search Event
searchBtn.addEventListener('click', () => {
    const city = cityInput.value.trim();
    if (city) getWeather(city);
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const city = cityInput.value.trim();
        if (city) getWeather(city);
    }
});

// Location Event
locationBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                getWeatherByCoords(position.coords.latitude, position.coords.longitude);
            },
            () => showError('Location access denied.')
        );
    }
});

// Unit Toggle
unitToggle.addEventListener('change', () => {
    currentUnit = unitToggle.checked ? 'imperial' : 'metric';
    // Re-fetch to get new units
    if (currentLat && currentLon) {
        // Need to re-fetch to get correct unit values from API
        // Alternatively we could just convert locally, but re-fetching is cleaner for API consistency
        fetchWeatherData(currentLat, currentLon, currentCity, ''); // Country name might be lost but it's okay for toggle
    }
});

// Theme Toggle
themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Update Icon
    themeToggle.innerHTML = isDarkMode ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
});

// Load Theme
function loadTheme() {
    if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

// Add Favorite Event
addFavBtn.addEventListener('click', toggleFavorite);

// Expose functions to global scope for HTML onclick attributes
window.getWeather = getWeather;
window.removeFavorite = removeFavorite;