namespace Shifter.Application.Features.Gigs;

#pragma warning disable IDE1006 // wire names

public record GigSaveDto(
    string? venue,
    string? category,
    string? employment,
    string[]? photos,
    string? schedule,
    string? title,
    string? details,
    string? date,
    string? start,
    string? end,
    decimal pay_amount,
    string? pay_period,
    decimal? pay_percent,
    string? city,
    int slots,
    /// <summary>Somebody has not turned up and the shift starts today.</summary>
    bool urgent = false);

public record GigDto(
    int id,
    string venue,
    string category,
    string employment,
    string[] photos,
    string? schedule,
    string title,
    string? details,
    string date,
    string start,
    string end,
    decimal pay_amount,
    string pay_period,
    decimal? pay_percent,
    string city,
    int slots,
    string status,
    string created_at,
    double? employer_rating,
    int employer_count,
    int responses,
    bool is_mine,
    /// <summary>What the caller's own reply looks like, when they made one.</summary>
    GigMyResponseDto? my_response,
    /// <summary>
    /// The unguessable half of the share link. Only the owner needs it — it is
    /// what makes a pasted link work for people who are not signed in without
    /// making the whole board countable.
    /// </summary>
    string? share_slug = null,
    /// <summary>
    /// What this shift is worth against the hours the caller already works.
    /// Null where there is nothing honest to say — no rate, not enough of
    /// their own hours to average, or a rate quoted in a period that cannot be
    /// brought to an hour.
    /// </summary>
    GigWorthDto? worth = null,
    /// <summary>
    /// Somebody has not turned up and the shift starts today. Shown as such,
    /// and the only listing in the app that reaches anybody by notification.
    /// </summary>
    bool urgent = false);

/// <summary>
/// The offered rate and the caller's own, both per hour, and the gap between
/// them as a percentage. A board full of rates tells nobody anything on its
/// own: 250 an hour is generous in one city and a pay cut in another.
/// </summary>
public record GigWorthDto(
    decimal offered_per_hour,
    decimal your_per_hour,
    /// <summary>Positive means better than the caller's usual hour.</summary>
    decimal difference_percent);

public record GigMyResponseDto(int id, bool accepted);

public record GigRespondDto(string? message, string? phone, string? telegram);

/// <summary>An owner's view of one reply: the person and what they chose to share.</summary>
public record GigResponseDto(
    int id,
    int user_id,
    string name,
    string? avatar_kind,
    string? avatar_data,
    string? message,
    string? phone,
    string? telegram,
    bool accepted,
    double? worker_rating,
    int worker_count,
    string created_at);

public record GigWithResponsesDto(GigDto gig, GigResponseDto[] replies);


public record SeekerSaveDto(
    string[]? categories,
    string? employment,
    string? city,
    string? about,
    string? availability,
    decimal? pay_amount,
    string? pay_period,
    string? phone,
    string? telegram,
    bool is_active);

public record SeekerDto(
    int id,
    int user_id,
    string name,
    string? avatar_kind,
    string? avatar_data,
    string[] categories,
    string employment,
    string city,
    string? about,
    string? availability,
    decimal? pay_amount,
    string? pay_period,
    string? phone,
    string? telegram,
    bool is_active,
    bool is_me,
    double? worker_rating,
    int worker_count,
    string updated_at);


public record ReviewSaveDto(int target_user_id, int rating, string[]? chips, string? text);

public record ReviewDto(
    int id,
    int author_user_id,
    string author_name,
    bool by_employer,
    int rating,
    string[] chips,
    string? text,
    string created_at);

/// <summary>A person's standing: as a worker and as an employer, separately.</summary>
public record ReputationDto(
    double? worker_rating,
    int worker_count,
    double? employer_rating,
    int employer_count,
    ReviewDto[] latest);

/// <summary>A review the caller still owes: who, for which shift, which hat they wear.</summary>
public record PendingReviewDto(
    int listing_id,
    string listing_title,
    string date,
    int target_user_id,
    string target_name,
    bool by_employer);


/// <summary>Somebody this venue has worked with before, worth calling directly.</summary>
public record KnownWorkerDto(
    int user_id,
    string name,
    string? avatar_kind,
    string? avatar_data,
    int times_worked,
    string last_worked,
    double? rating,
    int rating_count,
    string? phone,
    string? telegram);

public record InviteDto(int listing_id, int user_id);
