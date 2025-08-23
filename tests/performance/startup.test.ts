/**
 * Performance tests for startup optimizations
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ApplicationFactory } from '../../src/index';
import { PerformanceMonitor, MemoryOptimizer } from '../../src/utils/performance';

describe('Startup Performance', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clearMetrics();
    monitor.enable();
  });

  it('should have fast startup time with lazy loading', async () => {
    const startTime = performance.now();
    
    // Create factory (should be fast)
    const factory = new ApplicationFactory();
    const factoryTime = performance.now();
    
    // Create installer (should be fast due to lazy loading)
    const installer = factory.createZigInstaller();
    const installerTime = performance.now();
    
    const totalTime = installerTime - startTime;
    const factoryCreationTime = factoryTime - startTime;
    const installerCreationTime = installerTime - factoryTime;
    
    // Verify performance expectations
    expect(factoryCreationTime).toBeLessThan(10); // Should be under 10ms
    expect(installerCreationTime).toBeLessThan(50); // Should be under 50ms
    expect(totalTime).toBeLessThan(100); // Total should be under 100ms
    
    console.log(`📊 Factory creation: ${factoryCreationTime.toFixed(2)}ms`);
    console.log(`📊 Installer creation: ${installerCreationTime.toFixed(2)}ms`);
    console.log(`📊 Total startup: ${totalTime.toFixed(2)}ms`);
  });

  it('should have reasonable memory usage', () => {
    const factory = new ApplicationFactory();
    const installer = factory.createZigInstaller();
    
    const memUsage = process.memoryUsage();
    const heapMB = memUsage.heapUsed / 1024 / 1024;
    
    // Should use less than 50MB for basic initialization
    expect(heapMB).toBeLessThan(50);
    
    console.log(`📊 Memory usage: ${heapMB.toFixed(2)}MB heap`);
  });

  it('should cache platform detection results', () => {
    const factory = new ApplicationFactory();
    const installer = factory.createZigInstaller();
    
    const container = factory.getContainer();
    const platformDetector = container.resolve('platformDetector');
    
    // Multiple calls should return the same cached results
    const start = performance.now();
    const arch1 = platformDetector.getArch();
    const platform1 = platformDetector.getPlatform();
    const shell1 = platformDetector.getShellInfo();
    const ziggyDir1 = platformDetector.getZiggyDir();
    
    const arch2 = platformDetector.getArch();
    const platform2 = platformDetector.getPlatform();
    const shell2 = platformDetector.getShellInfo();
    const ziggyDir2 = platformDetector.getZiggyDir();
    const end = performance.now();
    
    // Results should be identical (cached)
    expect(arch1).toBe(arch2);
    expect(platform1).toBe(platform2);
    expect(shell1).toEqual(shell2);
    expect(ziggyDir1).toBe(ziggyDir2);
    
    // Should be very fast due to caching
    expect(end - start).toBeLessThan(5);
    
    console.log(`📊 Cached platform detection: ${(end - start).toFixed(2)}ms`);
  });

  it('should demonstrate lazy loading benefits', async () => {
    const factory = new ApplicationFactory();
    const installer = factory.createZigInstaller();
    
    // Initially, heavy modules should not be loaded
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Trigger lazy loading by calling a method that needs heavy modules
    monitor.startTimer('lazy-load-test');
    await installer.getAvailableVersions();
    monitor.endTimer('lazy-load-test');
    
    const afterMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (afterMemory - initialMemory) / 1024 / 1024;
    
    console.log(`📊 Memory increase after lazy loading: ${memoryIncrease.toFixed(2)}MB`);
    
    // Should have some memory increase but not excessive
    expect(memoryIncrease).toBeLessThan(20); // Less than 20MB increase
  });
});

describe('Memory Optimization', () => {
  it('should provide memory usage utilities', () => {
    const usage = MemoryOptimizer.getMemoryUsage();
    
    expect(usage.heap).toMatch(/^\d+\.\d{2}MB$/);
    expect(usage.external).toMatch(/^\d+\.\d{2}MB$/);
    expect(usage.total).toMatch(/^\d+\.\d{2}MB$/);
  });

  it('should monitor memory usage', () => {
    // This should not throw
    expect(() => {
      MemoryOptimizer.monitorMemory('test-operation');
    }).not.toThrow();
  });

  it('should force garbage collection when available', () => {
    // This should not throw regardless of whether gc is available
    expect(() => {
      MemoryOptimizer.forceGC();
    }).not.toThrow();
  });
});

describe('Performance Monitoring', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clearMetrics();
    monitor.enable();
  });

  it('should track operation timing', () => {
    monitor.startTimer('test-operation');
    
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait for 10ms
    }
    
    const metric = monitor.endTimer('test-operation');
    
    expect(metric).toBeDefined();
    expect(metric!.operation).toBe('test-operation');
    expect(metric!.duration).toBeGreaterThan(5);
    expect(metric!.duration).toBeLessThan(50);
  });

  it('should provide metrics collection', () => {
    monitor.startTimer('op1');
    monitor.endTimer('op1');
    
    monitor.startTimer('op2');
    monitor.endTimer('op2');
    
    const allMetrics = monitor.getMetrics();
    expect(allMetrics).toHaveLength(2);
    
    const op1Metrics = monitor.getMetrics('op1');
    expect(op1Metrics).toHaveLength(1);
    expect(op1Metrics[0].operation).toBe('op1');
  });

  it('should clear metrics', () => {
    monitor.startTimer('test');
    monitor.endTimer('test');
    
    expect(monitor.getMetrics()).toHaveLength(1);
    
    monitor.clearMetrics();
    expect(monitor.getMetrics()).toHaveLength(0);
  });
});