export type Sensor = {
  _id?: string;
  id: string;
  lat: number;
  lon: number;
  status: 'active' | 'inactive' | 'alert';
}

export type SensorData = {
  timestamp: Date;
  sensorId: string;
  alertType: "AOK" | "Poaching alert";
  videoData: {
    available: boolean;
    data: string;
  };
  audioData: {
    available: boolean;
    data: string;
  };
  viewed?: boolean;
  createdAt?: string;
  viewedAt?: string;
}
