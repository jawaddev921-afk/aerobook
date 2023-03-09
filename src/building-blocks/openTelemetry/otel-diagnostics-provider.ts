import {
  Context,
  Meter,
  Span,
  Tracer
} from '@opentelemetry/api';
import opentelemetry from '@opentelemetry/api';
import configs from '../configs/configs';

export class OtelDiagnosticsProvider {

  getInstrumentationName(): string {
    return configs.opentelemetry.serviceName!;
  }

  getTracer(): Tracer {
    // https://opentelemetry.io/docs/languages/js/instrumentation/#acquiring-a-tracer
    // It’s generally recommended to call getTracer in app when we need it rather than exporting the tracer instance
    // to the rest of your app.
    // This helps avoid trickier application load issues when other required dependencies are involved.
    return opentelemetry.trace.getTracer(
      configs.opentelemetry.serviceName!,
      configs.opentelemetry.serviceVersion ?? '1.0.0'
    );
  }

  getMeter(): Meter {
    // https://opentelemetry.io/docs/languages/js/instrumentation/#acquiring-a-meter
    // It’s generally recommended to call getMeter in app when we need it rather than exporting the meter instance to
    // the rest of your app.
    // This helps avoid trickier application load issues when other required dependencies are involved.
    return opentelemetry.metrics.getMeter(
      configs.opentelemetry.serviceName!,
      configs.opentelemetry.serviceVersion ?? '1.0.0'
    );
  }

  getCurrentSpan(): Span | undefined {
    return opentelemetry.trace.getActiveSpan();
  }

  getSpanFromContext(ctx: Context): Span | undefined {
    return opentelemetry.trace.getSpan(ctx);
  }
}
