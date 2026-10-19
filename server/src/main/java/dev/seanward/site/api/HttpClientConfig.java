package dev.seanward.site.api;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.restclient.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;

/** Every outgoing call gives up quickly, so a slow upstream never holds a visitor's request. */
@Configuration
public class HttpClientConfig {

    @Bean
    RestClientCustomizer timeouts() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(5));
        return builder -> builder.requestFactory(factory);
    }
}
