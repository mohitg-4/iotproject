export type Sensor = {
  _id?: string;
  id: string;
  lat: number;
  lon: number;
  status: 'active' | 'inactive' | 'alert';
}

export type SensorData = {
  sensorData: {
    timestamp: Date | string;
    sensorId: string;
    alertType: 'AOK' | 'Poaching alert';
    videoData: {
      available: boolean;
      data: string;
    };
    audioData: {
      available: boolean;
      sampleRate?: number;
      bitsPerSample?: number;
      duration?: number;
      filename?: string;
      wavFile?: Buffer;
    };
    viewed: boolean;
    _id: string;
  }
};
