namespace Shifter.Application.Features.Auth.DTOs;

public record AuthResponseDto(
    string access_token,
    string refresh_token,
    DateTime expires_at
    );