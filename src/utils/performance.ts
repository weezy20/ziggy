/**
 * Performance monitoring and optimization utilities
 * 
 * Provides tools for measuring and optimizing application performance
 */

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  operation: string;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private enabled: boolean = process.env.NODE_ENV !== 'production';

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public startTimer(operation: string): void {
    if (!this.enabled) return;

    this.metrics.set(operation, {
      operation,
      startTime: performance.now(),
      memoryUsage: process.memoryUsage()
    });
  }

  public endTimer(operation: string): PerformanceMetrics | null {
    if (!this.enabled) return null;

    const metric = this.metrics.get(operation);
    if (!metric) return null;

    const endTime = performance.now();
    const finalMetric: PerformanceMetrics = {
      ...metric,
      endTime,
      duration: endTime - metric.startTime,
      memoryUsage: process.memoryUsage()
    };

    this.metrics.set(operation, finalMetric);
    return finalMetric;
  }

  public getMetrics(operation?: string): PerformanceMetrics[] {
    if (operation) {
      const metric = this.metrics.get(operation);
      return metric ? [metric] : [];
    }
    return Array.from(this.metrics.values());
  }

  public clearMetrics(): void {
    this.metrics.clear();
  }

  public logMetrics(operation?: string): void {
    if (!this.enabled) return;

    const metrics = this.getMetrics(operation);
    if (metrics.length === 0) return;

    console.log('\n📊 Performance Metrics:');
    console.log('='.repeat(50));
    
    for (const metric of metrics) {
      if (metric.duration !== undefined) {
        console.log(`🔧 ${metric.operation}: ${metric.duration.toFixed(2)}ms`);
        
        if (metric.memoryUsage) {
          const memMB = (metric.memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
          console.log(`   Memory: ${memMB}MB heap used`);
        }
      }
    }
    console.log('='.repeat(50));
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }
}

/**
 * Memory optimization utilities
 */
export class MemoryOptimizer {
  private static readonly GC_THRESHOLD = 100 * 1024 * 1024; // 100MB

  /**
   * Force garbage collection if available and memory usage is high
   */
  public static forceGC(): void {
    const memUsage = process.memoryUsage();
    
    if (memUsage.heapUsed > this.GC_THRESHOLD && global.gc) {
      global.gc();
    }
  }

  /**
   * Get current memory usage in a readable format
   */
  public static getMemoryUsage(): { heap: string; external: string; total: string } {
    const usage = process.memoryUsage();
    return {
      heap: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      external: `${(usage.external / 1024 / 1024).toFixed(2)}MB`,
      total: `${((usage.heapUsed + usage.external) / 1024 / 1024).toFixed(2)}MB`
    };
  }

  /**
   * Monitor memory usage and warn if it gets too high
   */
  public static monitorMemory(operation: string): void {
    const usage = process.memoryUsage();
    const heapMB = usage.heapUsed / 1024 / 1024;
    
    if (heapMB > 200) { // Warn if over 200MB
      console.warn(`⚠️  High memory usage during ${operation}: ${heapMB.toFixed(2)}MB`);
    }
  }
}

/**
 * Decorator for measuring function performance
 */
export function measurePerformance(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const monitor = PerformanceMonitor.getInstance();
      monitor.startTimer(operation);
      
      try {
        const result = await method.apply(this, args);
        monitor.endTimer(operation);
        return result;
      } catch (error) {
        monitor.endTimer(operation);
        throw error;
      }
    };
  };
}

/**
 * Utility for debouncing function calls to improve performance
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Utility for throttling function calls to improve performance
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}