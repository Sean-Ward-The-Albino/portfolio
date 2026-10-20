package dev.seanward.site;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/** Serves the worlds (built by Vite in ../web) and the API under /api that makes them work. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class SiteApplication {
    public static void main(String[] args) {
        SpringApplication.run(SiteApplication.class, args);
    }
}
