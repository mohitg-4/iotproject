export type Animal = {
  _id: string;
  animal_ID: string;
  last_attributes: {
    lat: number;
    lon: number;
    velocity: number;
    altitude: number;
  };
  safe_area: {
    lat: number;
    lon: number;
    radius: number;
  };
};