import { logger, type LogFields } from './logger';

export interface MetricDimensions extends LogFields {}

export const metrics = {
  counter: (name: string, value = 1, dimensions: MetricDimensions = {}) => {
    logger.info('metric.counter', {
      metric: name,
      value,
      ...dimensions,
    });
  },
  timer: (name: string, durationMs: number, dimensions: MetricDimensions = {}) => {
    logger.info('metric.timer', {
      metric: name,
      durationMs,
      ...dimensions,
    });
  },
};
