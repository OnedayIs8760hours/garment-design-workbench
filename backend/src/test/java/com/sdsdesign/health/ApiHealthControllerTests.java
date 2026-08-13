package com.sdsdesign.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class ApiHealthControllerTests {

  @Test
  void healthReturnsServiceStatus() {
    Map<String, Object> response = new ApiHealthController().health();

    assertThat(response).containsEntry("status", "ok");
    assertThat(response).containsEntry("service", "sds-design-backend");
    assertThat(response).containsKey("time");
  }
}
