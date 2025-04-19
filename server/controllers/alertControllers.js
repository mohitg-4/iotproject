// Add this to existing alert controller
exports.getAlertsByAnimal = async (req, res) => {
    try {
      const alerts = await Alert.find({ 
        'sensorData.sensorId': req.params.animalId 
      }).sort({ 'sensorData.timestamp': -1 });
      
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching animal alerts:', error);
      res.status(500).json({ error: 'Failed to fetch animal alerts' });
    }
  };
  