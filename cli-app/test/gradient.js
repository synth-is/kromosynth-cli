function calculateSlopeAtLastPoint(values, windowSize = 5) {
  if (values.length < windowSize) {
      throw new Error("The array is shorter than the specified window size.");
  }

  // Take the last 'windowSize' points for the regression
  const y = values.slice(-windowSize);
  const x = [...Array(windowSize).keys()].map(i => i + values.length - windowSize);

  // Perform the linear regression using the least squares method
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < windowSize; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumXX += x[i] * x[i];
  }

  const slope = (windowSize * sumXY - sumX * sumY) / (windowSize * sumXX - sumX * sumX);

  return slope;
}

// Usage Example:
// const values = [10, 12, 15, 18, 17, 16, 19];  // Your array of values
const values = [1, 5, 9, 16, 23, 34, 72];

// Calculate the slope at the last point using a window of the last 5 points
const slopeAtLastPoint = calculateSlopeAtLastPoint(values, 5);
console.log(`Slope at the last point is: ${slopeAtLastPoint}`);
