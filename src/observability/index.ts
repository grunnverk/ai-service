/**
 * Observability module for agentic workflows
 *
 * Provides wrappers around riotprompt's observability features:
 * - ConversationLogger: Log and replay conversations
 * - MetricsCollector: Track tool usage and performance
 * - ReflectionReportGenerator: Generate self-reflection reports
 */

export * from './conversation-logger';
export * from './reflection';

// Export metrics but avoid naming conflict with agentic/executor
export { createMetricsCollector, type MetricsCollectorInstance, type MetricsConfig } from './metrics';
export type { ToolExecutionMetric as ObservabilityToolMetric } from './metrics';

// Re-export commonly used types
export type {
    ConversationLoggerInstance,
    ConversationLoggerConfig
} from './conversation-logger';


export type {
    ReflectionOptions
} from './reflection';

