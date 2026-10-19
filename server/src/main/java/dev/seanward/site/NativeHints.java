package dev.seanward.site;

import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

/** Files the native image must carry besides the static site, which Spring Boot already includes. */
@Configuration
@ImportRuntimeHints(NativeHints.Registrar.class)
public class NativeHints {
    static class Registrar implements RuntimeHintsRegistrar {
        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            hints.resources().registerPattern("content/*.json");
            hints.resources().registerPattern("static/**");
        }
    }
}
