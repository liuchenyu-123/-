export interface CityCoord {
  latitude: number;
  longitude: number;
}

export declare const CITY_COORDS: Readonly<Record<string, CityCoord>>;

export interface WeatherObservation {
  temperature?: number;
  dailyMax?: number;
  precipitation?: number;
  dailyPrecipitation?: number;
  weatherCode?: number;
  localDate?: string;
}

export interface WeatherClassification {
  weather: 'normal' | 'heat' | 'rain';
  dayType: 'weekday' | 'weekend';
  reason: 'rain-now' | 'rain-code' | 'wet-day' | 'heat-now' | 'heat-peak' | 'typical';
  weekend: boolean;
}

export declare function classifyWeather(observation?: WeatherObservation): WeatherClassification;
