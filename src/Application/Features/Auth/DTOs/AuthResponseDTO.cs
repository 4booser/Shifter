namespace Shifter.Application.Features.Auth.DTOs;

public record AuthResponseDTO(
    string access_token,
    string refresh_token,
    DateTime expires_at
    );