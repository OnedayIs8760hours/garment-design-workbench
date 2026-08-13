package com.sdsdesign.health;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ApiHealthController {

  @GetMapping("/health")
  public Map<String, Object> health() {
    return Map.of(
      "status", "ok",
      "service", "sds-design-backend",
      "time", Instant.now().toString()
    );
  }
}
